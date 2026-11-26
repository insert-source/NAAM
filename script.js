/* ==========================================
   Supabase 연결
========================================== */

const SUPABASE_URL = 'https://zflyufkyycugswtmgmby.supabase.co';

const SUPABASE_KEY = 'sb_publishable_GKt2RLlHrov3EtJxoGFZCQ_v-FBm-K9';

const ADMIN_ID = 'd4b40d10-07c5-44da-a481-234a531a62aa';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/* ==========================================
   데이터
========================================== */

let memos = JSON.parse(localStorage.getItem('memos')) || [];

let selectedColor = 'yellow';
let editingId = null;
let currentUser = null;


/* ==========================================
   탭 전환
========================================== */

document.querySelectorAll('.tab').forEach(tab => {

  tab.addEventListener('click', () => {

    document.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
    });

    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });

    tab.classList.add('active');

    document.getElementById(
      tab.dataset.tab + '-page'
    ).classList.add('active');

    if (tab.dataset.tab === 'random') {
      loadItems();
      loadHistory();
    }

  });

});


/* ==========================================
   메모장
========================================== */

const modal = document.getElementById('memo-modal');
const memoBoard = document.getElementById('memo-board');

function saveMemos() {

  localStorage.setItem(
    'memos',
    JSON.stringify(memos)
  );

}


function renderMemos() {

  memoBoard.innerHTML = '';

  memos.forEach(memo => {

    const card = document.createElement('div');

    card.className = `memo ${memo.color || 'yellow'}`;

    card.dataset.id = memo.id;

    card.style.left = (memo.x ?? 15) + 'px';
    card.style.top = (memo.y ?? 15) + 'px';

    card.style.width = (memo.width || 220) + 'px';
    card.style.height = (memo.height || 185) + 'px';

    card.style.zIndex = memo.zIndex || 1;


    const title = document.createElement('h3');
    title.textContent = memo.title;

    const content = document.createElement('p');
    content.textContent = memo.content;

    const date = document.createElement('div');
    date.className = 'memo-date';
    date.textContent = memo.date || '';

    const actions = document.createElement('div');
    actions.className = 'memo-actions';


    const editBtn = document.createElement('button');

    editBtn.textContent = '수정';

    editBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });

    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      editMemo(memo.id);
    });


    const deleteBtn = document.createElement('button');

    deleteBtn.textContent = '삭제';

    deleteBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });

    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteMemo(memo.id);
    });


    actions.append(editBtn, deleteBtn);

    card.append(title, content, date, actions);
card.addEventListener('pointerdown', () => {
  bringToFront(card, memo);
});
    memoBoard.appendChild(card);

       setupMemoDrag(card, memo);
    setupMemoResize(card, memo);
  });

  renderStickers();
}

/* ==========================================
   메모 추가
========================================== */

document.getElementById('add-memo-btn')
  .addEventListener('click', () => {

    editingId = null;

    document.getElementById('memo-title').value = '';

    document.getElementById('memo-content').value = '';

    selectedColor = 'yellow';

    updateColorSelection();

    modal.classList.add('open');

  });


document.getElementById('close-modal')
  .addEventListener('click', () => {

    modal.classList.remove('open');

  });


/* 색상 선택 */

function updateColorSelection() {

  document.querySelectorAll('.color-option').forEach(btn => {

    btn.classList.toggle(
      'selected',
      btn.dataset.color === selectedColor
    );

  });

}


document.querySelectorAll('.color-option').forEach(btn => {

  btn.addEventListener('click', () => {

    selectedColor = btn.dataset.color;

    updateColorSelection();

  });

});


/* 메모 저장 */

document.getElementById('save-memo-btn')
  .addEventListener('click', () => {

    const title = document.getElementById('memo-title')
      .value.trim();

    const content = document.getElementById('memo-content')
      .value.trim();


    if (!title && !content) {

      alert('메모 내용을 입력해 줘!');

      return;

    }


    if (editingId !== null) {

      const memo = memos.find(m => m.id === editingId);

      if (!memo) return;

      memo.title = title || '제목 없음';

      memo.content = content;

      memo.color = selectedColor;

    } else {

      const boardWidth = memoBoard.clientWidth;

      const offset = memos.length * 25;

      memos.push({

        id: Date.now(),

        title: title || '제목 없음',

        content: content,

        color: selectedColor,

        date: new Date().toLocaleDateString('ko-KR'),

        x: Math.max(10, (boardWidth - 240) / 2 + offset % 150),

        y: 20 + offset % 300,

        width: 220,

        height: 185,

   zIndex: Math.max(
  0,
  ...memos.map(m => Number(m.zIndex) || 0),
  ...stickers.map(s => Number(s.zIndex) || 0)
) + 1

      });

    }


    saveMemos();

    renderMemos();

    modal.classList.remove('open');

  });


/* 메모 수정 */

function editMemo(id) {

  const memo = memos.find(m => m.id === id);

  if (!memo) return;

  editingId = id;

  document.getElementById('memo-title').value = memo.title;

  document.getElementById('memo-content').value = memo.content;

  selectedColor = memo.color || 'yellow';

  updateColorSelection();

  modal.classList.add('open');

}


/* 메모 삭제 */

function deleteMemo(id) {

  if (!confirm('이 메모를 삭제할까?')) return;

  memos = memos.filter(m => m.id !== id);

  saveMemos();

  renderMemos();

}


/* ==========================================
   메모 드래그 이동
========================================== */

function setupMemoDrag(card, memo) {

  let startX = 0;
  let startY = 0;

  let originalX = 0;
  let originalY = 0;

  let dragging = false;


  card.addEventListener('pointerdown', e => {

    if (e.button !== 0) return;

    if (e.target.closest('button')) return;

    const rect = card.getBoundingClientRect();

    // 우측 아래 크기 조절 영역에서는 드래그하지 않음
    if (
      e.clientX > rect.right - 20 &&
      e.clientY > rect.bottom - 20
    ) {
      return;
    }

    dragging = true;

    startX = e.clientX;
    startY = e.clientY;

    originalX = memo.x ?? 15;
    originalY = memo.y ?? 15;

bringToFront(card, memo);

    card.setPointerCapture(e.pointerId);

  });


  card.addEventListener('pointermove', e => {

    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const maxX = Math.max(
      0,
      memoBoard.clientWidth - card.offsetWidth
    );

    const maxY = Math.max(
      0,
      memoBoard.clientHeight - card.offsetHeight
    );

    memo.x = Math.max(
      0,
      Math.min(maxX, originalX + dx)
    );

    memo.y = Math.max(
      0,
      Math.min(maxY, originalY + dy)
    );

    card.style.left = memo.x + 'px';

    card.style.top = memo.y + 'px';

  });


  function stopDragging() {

    if (!dragging) return;

    dragging = false;

    saveMemos();

  }


  card.addEventListener('pointerup', stopDragging);

  card.addEventListener('pointercancel', stopDragging);

}


/* ==========================================
   메모 크기 저장
========================================== */

function setupMemoResize(card, memo) {

  if (!window.ResizeObserver) return;

  let timer;

  const observer = new ResizeObserver(() => {

    clearTimeout(timer);

    timer = setTimeout(() => {

      memo.width = card.offsetWidth;

      memo.height = card.offsetHeight;

      saveMemos();

    }, 300);

  });

  observer.observe(card);

}


/* ==========================================
   관리자 로그인
========================================== */

const loginModal = document.getElementById('login-modal');


document.getElementById('admin-login-btn')
  .addEventListener('click', async () => {

    if (currentUser) {

      if (confirm('로그아웃할까?')) {

        const { error } = await supabaseClient.auth.signOut();

        if (error) {
          alert(error.message);
        }

      }

      return;

    }

    document.getElementById('admin-email').value = '';

    document.getElementById('admin-password').value = '';

    document.getElementById('login-message').textContent = '';

    loginModal.classList.add('open');

  });


document.getElementById('close-login-modal')
  .addEventListener('click', () => {

    loginModal.classList.remove('open');

  });


/* 로그인 실행 */

document.getElementById('login-submit-btn')
  .addEventListener('click', async () => {

    const email = document.getElementById('admin-email').value.trim();

    const password = document.getElementById('admin-password').value;

    const message = document.getElementById('login-message');

    message.textContent = '로그인 중...';


    const { data, error } = await supabaseClient.auth
      .signInWithPassword({

        email,

        password

      });


    if (error) {

      message.textContent = '로그인 실패: ' + error.message;

      return;

    }


    if (data.user.id !== ADMIN_ID) {

      await supabaseClient.auth.signOut();

      message.textContent = '관리자 계정이 아닙니다.';

      return;

    }


    currentUser = data.user;

    loginModal.classList.remove('open');

    updateAdminUI();

    await loadItems();

    await loadHistory();

    alert('관리자 로그인 성공!');

  });

function updateAdminUI() {

  const isAdmin = currentUser?.id === ADMIN_ID;

  const adminControls = document.getElementById('admin-controls');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const adminLoginBtn = document.getElementById('admin-login-btn');
  const itemList = document.getElementById('item-list');

  if (adminControls) {
    adminControls.classList.toggle('hidden', !isAdmin);
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.classList.toggle('hidden', !isAdmin);
  }

  if (adminLoginBtn) {
    adminLoginBtn.textContent =
      isAdmin ? '관리자 로그아웃' : '관리자 로그인';
  }

  if (itemList) {
    itemList.classList.toggle('hidden', !isAdmin);
  }

}


/* ==========================================
   랜덤 물건 목록
========================================== */

async function loadItems() {

  const list = document.getElementById('item-list');

  if (!list || currentUser?.id !== ADMIN_ID) return;

  const { data, error } = await supabaseClient
    .from('random_items')
    .select('name')
    .order('name');

  if (error) {
    list.textContent = '물건 목록을 불러오지 못했어.';
    console.error(error);
    return;
  }

  list.innerHTML = '';

  if (!data || data.length === 0) {
    list.textContent = '등록된 물건이 없어.';
    return;
  }

  data.forEach(item => {

    const tag = document.createElement('div');
    tag.className = 'item-tag';

    const name = document.createElement('span');
    name.textContent = item.name;

    tag.appendChild(name);

    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = '삭제';

    remove.addEventListener('click', () => {
      deleteItem(item.name);
    });

    tag.appendChild(remove);
    list.appendChild(tag);

  });

}


/* ==========================================
   경품 추가
========================================== */

const addItemBtn = document.getElementById('add-item-btn');
const itemNameInput = document.getElementById('item-name');

if (addItemBtn) {
  addItemBtn.addEventListener('click', addItem);
}

if (itemNameInput) {
  itemNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addItem();
  });
}


async function addItem() {

  if (currentUser?.id !== ADMIN_ID) {

    alert('관리자만 추가할 수 있어.');

    return;

  }


  const input = document.getElementById('item-name');

  const name = input.value.trim();

  if (!name) return;


  const { error } = await supabaseClient
    .from('random_items')
    .insert({

      name: name

    });


  if (error) {

    alert('추가 실패: ' + error.message);

    return;

  }


  input.value = '';

  await loadItems();

  alert('물건을 추가했어!');

}


/* ==========================================
   경품 삭제
========================================== */

async function deleteItem(name) {

  if (currentUser?.id !== ADMIN_ID) {

    alert('관리자만 삭제할 수 있어.');

    return;

  }


  if (!confirm(`"${name}"을(를) 삭제할까?`)) return;


  const { error } = await supabaseClient
    .from('random_items')
    .delete()
    .eq('name', name);


  if (error) {

    alert('삭제 실패: ' + error.message);

    return;

  }


  await loadItems();

}


/* ==========================================
   랜덤 뽑기
========================================== */

const drawButton = document.getElementById('draw-btn');

if (drawButton) {
  drawButton.addEventListener('click', drawPrize);
}


async function drawPrize() {

  const button = document.getElementById('draw-btn');

  const resultBox = document.getElementById('draw-result');

  const description = document.getElementById('draw-description');

  const status = document.getElementById('draw-status');


  button.disabled = true;

  button.textContent = '뽑는 중...';

  status.textContent = '';


  try {

    const { data, error } = await supabaseClient.functions.invoke(
      'smooth-function',
      {
        method: 'POST'
      }
    );


    if (error) {

      throw error;

    }


    if (data?.already_drawn) {

      status.textContent = '오늘은 이미 뽑기를 완료했어! 내일 다시 도전해 줘.';

      return;

    }


    if (data?.error === 'NO_ITEMS') {

      status.textContent = '뽑을 물건이 없어!';

      return;

    }


    if (!data?.success || !data?.prize_name) {

      throw new Error(data?.error || '뽑기에 실패했어.');

    }


    const prize = data.prize_name;

    resultBox.innerHTML = '';

    const span = document.createElement('span');

    span.textContent = prize;

    resultBox.appendChild(span);


    description.textContent = '오늘 선택된 물건은 ' + prize + ' 입니다.';

    status.textContent = '오늘의 뽑기를 완료했어!';


    await loadHistory();

  } catch (error) {

    console.error(error);

    status.textContent =
      '오류가 발생했어: ' + (error.message || '다시 시도해 줘.');

  } finally {

    button.disabled = false;

    button.textContent = '물건 뽑기';

  }

}


/* ==========================================
   뽑기 기록
========================================== */

async function loadHistory() {

  const container = document.getElementById('draw-history');

  container.innerHTML = '<p>기록을 불러오는 중...</p>';


  const { data, error } = await supabaseClient
    .from('draw_history')
    .select('prize_name, drawn_at')
    .order('drawn_at', { ascending: false })
    .limit(100);


  if (error) {

    container.textContent = '기록을 불러오지 못했어.';

    console.error(error);

    return;

  }


  container.innerHTML = '';


  if (!data || data.length === 0) {

    container.textContent = '아직 뽑기 기록이 없어.';

    return;

  }


  data.forEach(record => {

    const row = document.createElement('div');

    row.className = 'history-item';


    const name = document.createElement('strong');

    name.textContent = record.prize_name;


    const date = document.createElement('span');

    date.textContent = new Date(record.drawn_at)
      .toLocaleString('ko-KR');


    row.append(name, date);

    container.appendChild(row);

  });

}


/* ==========================================
   뽑기 기록 삭제
========================================== */

document.getElementById('clear-history-btn')
  .addEventListener('click', clearHistory);


async function clearHistory() {

  if (currentUser?.id !== ADMIN_ID) {

    alert('관리자만 삭제할 수 있어.');

    return;

  }


  if (!confirm('전체 뽑기 기록을 삭제할까?')) return;


  const { error } = await supabaseClient
    .from('draw_history')
    .delete()
    .neq('id', 0);


  if (error) {

    alert('기록 삭제 실패: ' + error.message);

    return;

  }


  await loadHistory();

  alert('뽑기 기록을 삭제했어!');

}


/* ==========================================
   초기 실행
========================================== */

async function initializeSite() {

  renderMemos();

  await checkLogin();

  await loadItems();

  await loadHistory();

}


initializeSite();
/* ==========================================
   이모지 스티커 선택 기능
========================================== */

const emojiPicker = document.getElementById('emoji-picker');
const emojiList = document.getElementById('emoji-list');
const emojiSearch = document.getElementById('emoji-search');

const emojiCategories = {
  얼굴: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 🥹 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 👾 🤖 🎃',
  동물: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🦭 🦦 🦥 🐘 🦣 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦔 🐾',
  식물: '🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🪺 🪻 🌷 🪷 🌹 🥀 🌺 🌸 🌼 🌻 🌞',
  음식: '🍇 🍈 🍉 🍊 🍋 🍌 🍍 🥭 🍎 🍏 🍐 🍑 🍒 🍓 🫐 🥝 🍅 🫒 🥥 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🍳 🥚 🧈 🥞 🧂 🍿 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍷 🥂 🍹 🧉',
  사물: '⌚ 📱 💻 🖥️ 🖨️ ⌨️ 🖱️ 💽 💾 💿 📷 📸 📹 🎥 📺 📻 🎙️ 🎧 🎤 📢 📣 🔔 🔕 🕯️ 💡 🔦 🏮 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📰 🗞️ 🔖 🏷️ 💰 💴 💵 💶 💷 💳 💎 ⚖️ 🧸 🪆 🪄 🎀 🎁 🎈 🎉 🎊 🎏 🎐 🪩 🪅 🪆 🖼️ 🪞 🛍️',
  기호: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❣️💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☯️ ✡️ 🕉️ ☸️ 🔯 🪯 ☪️ ☦️ 🛐 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💯 🔥 ✨ ⭐ 🌟 💫 ☀️ 🌙 ☁️ 🌈 ❄️ ⚡ 💧 💦 🌊 🎵 🎶 💭 💤',
  활동: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤸 🤼 🤽 🤾 🧗 🚴 🚵 🏇 🧘 🏄 🏊',
  교통: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🛹 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 ✈️ 🛫 🛬 🛩️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ 🚢 ⚓'
};

let allEmojis = [];

Object.values(emojiCategories).forEach(category => {
  allEmojis.push(...category.split(' '));
});

allEmojis = [...new Set(allEmojis)];

function renderEmojiList(search = '') {
  emojiList.innerHTML = '';

  const filtered = allEmojis.filter(emoji => {
    return !search || emoji.includes(search);
  });

  filtered.forEach(emoji => {
    const button = document.createElement('button');
    button.className = 'emoji-choice';
    button.textContent = emoji;
    button.type = 'button';

    button.addEventListener('click', () => {
      addSticker(emoji);
      emojiPicker.classList.add('hidden');
      emojiSearch.value = '';
      renderEmojiList();
    });

    emojiList.appendChild(button);
  });
}

document.getElementById('add-sticker-btn')
  .addEventListener('click', () => {
    emojiPicker.classList.toggle('hidden');
    renderEmojiList();
  });

document.getElementById('close-emoji-picker')
  .addEventListener('click', () => {
    emojiPicker.classList.add('hidden');
  });

emojiSearch.addEventListener('input', () => {
  renderEmojiList(emojiSearch.value.trim());
});

/* ==========================================
   스티커 저장 및 표시
========================================== */

let stickers = JSON.parse(localStorage.getItem('stickers')) || [];

let stickerZIndex = 1000;

function saveStickers() {
  localStorage.setItem('stickers', JSON.stringify(stickers));
}


/* 스티커 추가 */

function addSticker(emoji) {

  const sticker = {
    id: Date.now() + Math.random(),
    emoji: emoji,
    x: 80 + Math.random() * 100,
    y: 80 + Math.random() * 100,
    size: 48,
    rotation: 0,
  zIndex: Math.max(
  0,
  ...memos.map(m => Number(m.zIndex) || 0),
  ...stickers.map(s => Number(s.zIndex) || 0)
) + 1
  };

  stickers.push(sticker);

  saveStickers();
  renderStickers();
}


/* 스티커 표시 */

function renderStickers() {

  document.querySelectorAll('.sticker').forEach(el => el.remove());

  stickers.forEach(sticker => {

    const el = document.createElement('div');

    el.className = 'sticker';
    el.dataset.id = sticker.id;
    el.textContent = sticker.emoji;

    el.style.left = sticker.x + 'px';
    el.style.top = sticker.y + 'px';
    el.style.fontSize = sticker.size + 'px';
    el.style.zIndex = sticker.zIndex || 1000;
    el.style.transform = `rotate(${sticker.rotation || 0}deg)`;

    memoBoard.appendChild(el);

    setupStickerDrag(el, sticker);
    setupStickerControls(el, sticker);

  });

}


/* 스티커 이동 */

function setupStickerDrag(el, sticker) {

  let startX = 0;
  let startY = 0;
  let originalX = 0;
  let originalY = 0;
  let dragging = false;

  el.addEventListener('pointerdown', e => {

    if (e.button !== 0) return;

    if (e.target.closest('.sticker-controls')) return;

    dragging = true;

    startX = e.clientX;
    startY = e.clientY;

    originalX = sticker.x;
    originalY = sticker.y;

  bringToFront(el, sticker);

    el.setPointerCapture(e.pointerId);

  });

  el.addEventListener('pointermove', e => {

    if (!dragging) return;

    sticker.x = Math.max(0, originalX + e.clientX - startX);
    sticker.y = Math.max(0, originalY + e.clientY - startY);

    el.style.left = sticker.x + 'px';
    el.style.top = sticker.y + 'px';

  });

  function stopDragging() {

    if (!dragging) return;

    dragging = false;
    saveStickers();

  }

  el.addEventListener('pointerup', stopDragging);
  el.addEventListener('pointercancel', stopDragging);

}


/* 스티커 조작 버튼 */

function setupStickerControls(el, sticker) {

  const controls = document.createElement('div');
  controls.className = 'sticker-controls';

  const smaller = document.createElement('button');
  smaller.textContent = '−';
  smaller.title = '작게';

  const bigger = document.createElement('button');
  bigger.textContent = '+';
  bigger.title = '크게';

  const rotate = document.createElement('button');
  rotate.textContent = '↻';
  rotate.title = '회전';

  const remove = document.createElement('button');
  remove.textContent = '×';
  remove.title = '삭제';

  smaller.addEventListener('click', e => {
    e.stopPropagation();
    sticker.size = Math.max(20, sticker.size - 8);
    el.style.fontSize = sticker.size + 'px';
    saveStickers();
  });

  bigger.addEventListener('click', e => {
    e.stopPropagation();
    sticker.size = Math.min(150, sticker.size + 8);
    el.style.fontSize = sticker.size + 'px';
    saveStickers();
  });

  rotate.addEventListener('click', e => {
    e.stopPropagation();
    sticker.rotation = (sticker.rotation + 15) % 360;
    el.style.transform = `rotate(${sticker.rotation}deg)`;
    saveStickers();
  });

  remove.addEventListener('click', e => {
    e.stopPropagation();

    stickers = stickers.filter(s => s.id !== sticker.id);

    saveStickers();
    renderStickers();
  });

  controls.append(smaller, bigger, rotate, remove);
  el.appendChild(controls);

}


/* 스티커 초기 표시 */

renderStickers();
/* ==========================================
   메모와 스티커 레이어 통합
========================================== */

function bringToFront(element, item) {

  const memoIndexes = memos.map(m => Number(m.zIndex) || 0);
  const stickerIndexes = stickers.map(s => Number(s.zIndex) || 0);

  const highest = Math.max(0, ...memoIndexes, ...stickerIndexes);

  const nextIndex = highest + 1;

  item.zIndex = nextIndex;
  element.style.zIndex = nextIndex;

  saveMemos();
  saveStickers();
}
