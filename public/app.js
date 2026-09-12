/* NS ChatX client — authentication via REST, live messages over WebSocket */
(() => {
  'use strict';

  const isLocalHost =
    !location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const API = isLocalHost ? 'http://localhost:3000' : location.origin;

  function wsURL(token) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws?token=${token}`;
  }

  const $ = (id) => document.getElementById(id);
  const el = {
    lobby: $('lobby'),
    chat: $('chat'),
    tabJoin: $('tab-join'),
    tabCreate: $('tab-create'),
    heading: $('auth-heading'),
    sub: $('auth-sub'),
    form: $('auth-form'),
    username: $('username'),
    roomId: $('roomId'),
    password: $('password'),
    roomHint: $('room-hint'),
    genRoom: $('gen-room'),
    togglePw: $('toggle-pw'),
    error: $('auth-error'),
    submit: $('submit-btn'),
    submitLabel: document.querySelector('#submit-btn .btn__label'),
    roomLabel: $('room-label'),
    connDot: $('conn-dot'),
    connText: $('conn-text'),
    onlineCount: $('online-count'),
    stream: $('stream'),
    members: $('members'),
    membersList: $('members-list'),
    membersBtn: $('members-btn'),
    chatBody: document.querySelector('.chat__body'),
    typing: $('typing'),
    composer: $('composer'),
    input: $('input'),
    send: $('send'),
    leave: $('leave-btn'),
    copy: $('copy-invite'),
    toast: $('toast'),
  };

  /* ------------------------------- theme --------------------------------- */
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  let theme = prefersDark.matches ? 'dark' : 'light';
  const applyTheme = () => document.documentElement.setAttribute('data-theme', theme);
  applyTheme();
  const toggleTheme = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme();
  };
  $('theme-toggle-lobby').addEventListener('click', toggleTheme);
  $('theme-toggle-chat').addEventListener('click', toggleTheme);

  /* -------------------------------- toast -------------------------------- */
  let toastTimer;
  function toast(text) {
    el.toast.textContent = text;
    el.toast.hidden = false;
    requestAnimationFrame(() => el.toast.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('is-visible');
      setTimeout(() => (el.toast.hidden = true), 220);
    }, 2200);
  }

  /* ------------------------------ lobby tabs ----------------------------- */
  let mode = 'join';
  function setMode(next) {
    mode = next;
    const creating = mode === 'create';
    el.tabCreate.classList.toggle('is-active', creating);
    el.tabJoin.classList.toggle('is-active', !creating);
    el.tabCreate.setAttribute('aria-selected', String(creating));
    el.tabJoin.setAttribute('aria-selected', String(!creating));
    el.heading.textContent = creating ? 'Create a new room' : 'Join an existing room';
    el.sub.textContent = creating
      ? 'Pick a room ID and a password, then share both with whoever should join you.'
      : 'Enter the room ID and password you were given, plus the name others will see.';
    el.submitLabel.textContent = creating ? 'Create room' : 'Enter room';
    el.roomId.placeholder = creating ? 'e.g. ABC123 (or generate)' : 'e.g. ABC123';
    el.roomHint.textContent = creating
      ? 'Leave blank for a random 6-character ID.'
      : 'Case-insensitive. Letters, numbers and dashes.';
    el.genRoom.hidden = !creating;
    el.roomId.required = !creating;
    hideError();
  }
  el.tabJoin.addEventListener('click', () => setMode('join'));
  el.tabCreate.addEventListener('click', () => setMode('create'));
  setMode('join');

  el.genRoom.addEventListener('click', () => {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += abc[Math.floor(Math.random() * abc.length)];
    el.roomId.value = out;
    el.roomId.focus();
  });

  el.roomId.addEventListener('input', () => {
    el.roomId.value = el.roomId.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  el.togglePw.addEventListener('click', () => {
    const showing = el.password.type === 'text';
    el.password.type = showing ? 'password' : 'text';
    el.togglePw.textContent = showing ? 'Show' : 'Hide';
    el.togglePw.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
  }
  function hideError() {
    el.error.hidden = true;
  }
  function loading(on) {
    el.submit.classList.toggle('is-loading', on);
    el.submit.disabled = on;
  }

  /* ------------------------------ auth submit ---------------------------- */
  let session = null;

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    const body = {
      username: el.username.value.trim(),
      roomId: el.roomId.value.trim(),
      password: el.password.value,
    };
    if (body.username.length < 2) return showError('Username must be at least 2 characters.');
    if (body.password.length < 4) return showError('Password must be at least 4 characters.');
    if (mode === 'join' && !body.roomId) return showError('Enter the room ID you want to join.');

    loading(true);
    try {
      const url = mode === 'create' ? `${API}/api/rooms` : `${API}/api/rooms/join`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseText = await res.text();
      let data = {};
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`Server returned an invalid response (${res.status}).`);
        }
      }
      if (!res.ok) throw new Error(data.error || 'Could not connect to the room.');
      if (!data.roomId || !data.username || !data.token) {
        throw new Error('Server returned an incomplete response.');
      }
      session = data;
      enterRoom();
    } catch (err) {
      showError(err.message || 'Something went wrong. Try again.');
    } finally {
      loading(false);
    }
  });

  /* -------------------------------- room -------------------------------- */
  let ws = null;
  let lastFrom = null;
  let lastDay = null;
  let reconnectTries = 0;
  let leaving = false;
  const typingUsers = new Map();

  function enterRoom() {
    el.lobby.hidden = true;
    el.chat.hidden = false;
    el.roomLabel.textContent = session.roomId;
    document.title = `#${session.roomId} — NS ChatX`;
    el.stream.innerHTML = '';
    lastFrom = null;
    lastDay = null;
    connect();
    setTimeout(() => el.input.focus(), 60);
  }

  function setConn(state) {
    const map = {
      live: ['dot dot--live', 'Connected'],
      wait: ['dot', 'Reconnecting…'],
      off: ['dot dot--off', 'Disconnected'],
    };
    const [cls, text] = map[state];
    el.connDot.className = cls;
    el.connText.textContent = text;
  }

  function connect() {
    setConn(reconnectTries ? 'wait' : 'live');
    ws = new WebSocket(wsURL(session.token));

    ws.addEventListener('open', () => {
      reconnectTries = 0;
      setConn('live');
    });

    ws.addEventListener('message', (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === 'welcome') {
        el.stream.innerHTML = '';
        lastFrom = null;
        lastDay = null;
        if (!m.history.length) renderEmpty();
        m.history.forEach(render);
        renderMembers(m.users);
        setOnline(m.count);
        scrollDown(true);
      } else if (m.type === 'message' || m.type === 'system') {
        clearEmpty();
        render(m);
        scrollDown();
      } else if (m.type === 'presence') {
        renderMembers(m.users);
        setOnline(m.count);
      } else if (m.type === 'typing') {
        setTyping(m.from, m.active);
      } else if (m.type === 'error') {
        toast(m.message);
      }
    });

    ws.addEventListener('close', () => {
      if (leaving) return;
      setConn('off');
      if (reconnectTries < 6) {
        reconnectTries += 1;
        setConn('wait');
        setTimeout(connect, Math.min(1000 * reconnectTries, 5000));
      } else {
        toast('Connection lost. Reload to rejoin.');
      }
    });
  }

  function setOnline(n) {
    el.onlineCount.textContent = `${n} online`;
  }

  /* ------------------------------ rendering ----------------------------- */
  const time = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayKey = (ts) => new Date(ts).toDateString();
  const dayLabel = (ts) => {
    const d = new Date(ts);
    const today = new Date().toDateString();
    if (d.toDateString() === today) return 'Today';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  function renderEmpty() {
    const box = document.createElement('div');
    box.className = 'empty';
    box.id = 'empty-state';
    box.innerHTML = `
      <span class="empty__badge">#</span>
      <p class="empty__title">Room ${session.roomId} is live</p>
      <p class="empty__text">Share the room ID and password with someone. Whatever you type appears on their screen instantly.</p>`;
    el.stream.appendChild(box);
  }
  function clearEmpty() {
    const e = $('empty-state');
    if (e) e.remove();
  }

  function render(m) {
    const key = dayKey(m.ts);
    if (key !== lastDay) {
      lastDay = key;
      lastFrom = null;
      const d = document.createElement('p');
      d.className = 'day';
      d.textContent = dayLabel(m.ts);
      el.stream.appendChild(d);
    }

    if (m.type === 'system') {
      lastFrom = null;
      const p = document.createElement('p');
      p.className = 'sys';
      p.textContent = m.text;
      el.stream.appendChild(p);
      return;
    }

    const mine = m.from === session.username;
    const wrap = document.createElement('article');
    wrap.className = `msg ${mine ? 'msg--me' : 'msg--them'}${m.from === lastFrom ? ' msg--stack' : ''}`;

    const head = document.createElement('header');
    head.className = 'msg__head';
    const who = document.createElement('span');
    who.className = 'msg__who';
    who.textContent = mine ? 'You' : m.from;
    const when = document.createElement('span');
    when.className = 'msg__time';
    when.textContent = time(m.ts);
    head.append(who, when);

    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble';
    bubble.textContent = m.text;

    wrap.append(head, bubble);
    el.stream.appendChild(wrap);
    lastFrom = m.from;
  }

  function scrollDown(force) {
    const near = el.stream.scrollHeight - el.stream.scrollTop - el.stream.clientHeight < 220;
    if (force || near) el.stream.scrollTop = el.stream.scrollHeight;
  }

  function initials(name) {
    return name.trim().slice(0, 2).toUpperCase();
  }

  function renderMembers(users) {
    el.membersList.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      li.className = 'member';
      const av = document.createElement('span');
      av.className = 'avatar';
      av.textContent = initials(u);
      const name = document.createElement('span');
      name.className = 'member__name';
      name.textContent = u;
      li.append(av, name);
      if (u === session.username) {
        const you = document.createElement('span');
        you.className = 'member__you';
        you.textContent = 'you';
        li.appendChild(you);
      }
      el.membersList.appendChild(li);
    });
  }

  el.membersBtn.addEventListener('click', () => {
    const show = el.members.hidden;
    el.members.hidden = !show;
    el.chatBody.classList.toggle('has-members', show);
  });

  /* ------------------------------- typing ------------------------------- */
  function setTyping(user, active) {
    if (active) {
      clearTimeout(typingUsers.get(user));
      typingUsers.set(
        user,
        setTimeout(() => {
          typingUsers.delete(user);
          paintTyping();
        }, 3500),
      );
    } else {
      clearTimeout(typingUsers.get(user));
      typingUsers.delete(user);
    }
    paintTyping();
  }
  function paintTyping() {
    const names = [...typingUsers.keys()];
    if (!names.length) return (el.typing.textContent = '');
    el.typing.textContent =
      names.length === 1
        ? `${names[0]} is typing…`
        : `${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and others' : ''} are typing…`;
  }

  let typingSent = false;
  let typingTimer;
  function signalTyping() {
    if (!ws || ws.readyState !== 1) return;
    if (!typingSent) {
      typingSent = true;
      ws.send(JSON.stringify({ type: 'typing', active: true }));
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1800);
  }
  function stopTyping() {
    clearTimeout(typingTimer);
    if (typingSent && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'typing', active: false }));
    }
    typingSent = false;
  }

  /* ------------------------------ composer ------------------------------ */
  function autoGrow() {
    el.input.style.height = 'auto';
    el.input.style.height = `${Math.min(el.input.scrollHeight, 160)}px`;
  }
  el.input.addEventListener('input', () => {
    autoGrow();
    signalTyping();
  });
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });

  el.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text) return;
    if (!ws || ws.readyState !== 1) return toast('Not connected yet — reconnecting.');
    ws.send(JSON.stringify({ type: 'message', text }));
    el.input.value = '';
    autoGrow();
    stopTyping();
    el.input.focus();
  });

  el.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(session.roomId);
      toast(`Room ID ${session.roomId} copied`);
    } catch {
      toast(`Room ID: ${session.roomId}`);
    }
  });

  el.leave.addEventListener('click', () => {
    leaving = true;
    if (ws) ws.close();
    ws = null;
    session = null;
    typingUsers.clear();
    el.typing.textContent = '';
    el.chat.hidden = true;
    el.lobby.hidden = false;
    el.password.value = '';
    document.title = 'NS ChatX — private real-time rooms';
    leaving = false;
    reconnectTries = 0;
  });

  window.addEventListener('beforeunload', () => {
    leaving = true;
    if (ws) ws.close();
  });
})();
