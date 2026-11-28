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

const boardClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      storageKey: 'naam-board-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);


/* ==========================================
   데이터 및 DOM
========================================== */

let memos = [];
let stickers = [];

let selectedColor = 'yellow';
let editingId = null;
let currentUser = null;
let boardUser = null;
let boardReady = false;
let boardChannel = null;

let activeInteractions = 0;
let pendingRefresh = false;
let pendingWrites = 0;
let refreshTimer = null;
let boardLoadVersion = 0;

const modal = document.getElementById('memo-modal');
const memoBoard = document.getElementById('memo-board');
const loginModal = document.getElementById('login-modal');

const emojiPicker = document.getElementById('emoji-picker');
const emojiList = document.getElementById('emoji-list');
const emojiSearch = document.getElementById('emoji-search');


/* ==========================================
   권한 확인
========================================== */

function isAdmin() {
  return currentUser?.id === ADMIN_ID;
}

function getBoardClient() {
  return isAdmin() ? supabaseClient : boardClient;
}

function canEditObject(item) {
  return isAdmin() || (
    !!boardUser &&
    item.ownerId === boardUser.id
  );
}


/* ==========================================
   날짜 및 시간
========================================== */

function formatMemoDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const get = type =>
    parts.find(part => part.type === type)?.value || '';

  return `${get('year')}. ${get('month')}. ${get('day')}. ${get('hour')}:${get('minute')}`;
}


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

    if (tab.dataset.tab === 'memo' && boardReady) {
      requestBoardRefresh();
    }
  });
});


/* ==========================================
   게시판 실시간 갱신
========================================== */

function beginInteraction() {
  activeInteractions++;
}

function endInteraction() {
  activeInteractions = Math.max(
    0,
    activeInteractions - 1
  );

  if (!activeInteractions && pendingRefresh) {
    requestBoardRefresh();
  }
}

function requestBoardRefresh() {
  pendingRefresh = true;

  clearTimeout(refreshTimer);

  refreshTimer = setTimeout(async () => {

    if (activeInteractions > 0 || pendingWrites > 0) {
      return;
    }

    pendingRefresh = false;

    try {
      await loadBoard();
    } catch (error) {
      console.error('게시판 갱신 실패:', error);
    }

  }, 250);
}


/* ==========================================
   익명 로그인 및 게시판 연결
========================================== */

async function initializeBoard() {

  const { data, error } =
    await boardClient.auth.getSession();

  if (error) throw error;

  if (data.session) {
    boardUser = data.session.user;
  } else {

    const {
      data: loginData,
      error: loginError
    } = await boardClient.auth.signInAnonymously();

    if (loginError) throw loginError;

    boardUser = loginData.user;
  }

  boardReady = true;

  await loadBoard();

  if (boardChannel) {
    await boardClient.removeChannel(boardChannel);
  }

  boardChannel = boardClient
    .channel('naam-shared-board')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'board_objects'
      },
      () => {
        requestBoardRefresh();
      }
    )
    .subscribe(status => {

      if (status === 'SUBSCRIBED') {
        requestBoardRefresh();
      }

      if (status === 'CHANNEL_ERROR') {
        console.error('게시판 실시간 연결 오류');
      }

    });
}


/* ==========================================
   게시판 불러오기
========================================== */

async function loadBoard() {

  const version = ++boardLoadVersion;

  const { data, error } = await getBoardClient()
    .from('board_objects')
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  if (version !== boardLoadVersion) return;

  if (activeInteractions > 0 || pendingWrites > 0) {
    pendingRefresh = true;
    return;
  }

  const nextMemos = [];
  const nextStickers = [];

  (data || []).forEach((row, index) => {

    const item = {
      ...row.content,
      id: row.id,
      ownerId: row.owner_id,
      createdAt: new Date(row.created_at).getTime(),
      zIndex: index + 1
    };

    if (row.object_type === 'memo') {
      nextMemos.push(item);
    }

    if (row.object_type === 'sticker') {
      nextStickers.push(item);
    }

  });

  memos = nextMemos;
  stickers = nextStickers;

  renderMemos();
}


/* ==========================================
   게시판 데이터 생성
========================================== */

async function createBoardObject(type, item) {

  if (!boardReady) {
    alert('게시판 연결 중입니다.');
    return false;
  }

  pendingWrites++;

  try {

    const { error } = await getBoardClient()
      .from('board_objects')
      .insert({
        object_type: type,
        content: item
      });

    if (error) throw error;

    return true;

  } catch (error) {

    alert('저장 실패: ' + error.message);
    return false;

  } finally {

    pendingWrites--;
    requestBoardRefresh();

  }
}


/* ==========================================
   게시판 데이터 수정
========================================== */

let boardWriteQueue = Promise.resolve();

function updateBoardObject(item) {

  if (!canEditObject(item)) {
    return Promise.resolve(false);
  }

  const client = getBoardClient();

  const {
    id,
    ownerId,
    createdAt,
    zIndex,
    ...content
  } = item;

  const snapshot = JSON.parse(
    JSON.stringify(content)
  );

  pendingWrites++;

  const task = boardWriteQueue.then(async () => {

    try {

      const { data, error } = await client
        .from('board_objects')
        .update({
          content: snapshot
        })
        .eq('id', id)
        .select('id');

      if (error) throw error;

      if (!data?.length) {
        throw new Error('수정 권한이 없습니다.');
      }

      return true;

    } catch (error) {

      alert('수정 실패: ' + error.message);
      return false;

    } finally {

      pendingWrites--;
      requestBoardRefresh();

    }

  });

  boardWriteQueue = task.catch(console.error);

  return task;
}


/* ==========================================
   게시판 데이터 삭제
========================================== */

async function deleteBoardObject(item) {

  if (!canEditObject(item)) {
    alert('본인이 작성한 게시물만 삭제할 수 있어.');
    return false;
  }

  pendingWrites++;

  try {

    await boardWriteQueue;

    const { data, error } = await getBoardClient()
      .from('board_objects')
      .delete()
      .eq('id', item.id)
      .select('id');

    if (error) throw error;

    if (!data?.length) {
      throw new Error('삭제 권한이 없습니다.');
    }

    return true;

  } catch (error) {

    alert('삭제 실패: ' + error.message);
    return false;

  } finally {

    pendingWrites--;
    requestBoardRefresh();

  }
}


/* ==========================================
   메모 표시
========================================== */

const memoObservers = new Set();

function renderMemos() {

  memoObservers.forEach(observer => {
    observer.disconnect();
  });

  memoObservers.clear();

  memoBoard.innerHTML = '';
  memoBoard.style.position = 'relative';

  memos.forEach(memo => {

    const editable = canEditObject(memo);

    const card = document.createElement('div');

    card.className = `memo ${memo.color || 'yellow'}`;
    card.dataset.id = memo.id;

    card.style.left = (memo.x ?? 15) + 'px';
    card.style.top = (memo.y ?? 15) + 'px';

    card.style.width = (memo.width || 220) + 'px';
    card.style.height = (memo.height || 185) + 'px';

    card.style.setProperty(
      'z-index',
      String(Number(memo.zIndex) || 1),
      'important'
    );

    const content = document.createElement('p');
    content.textContent = memo.content || '';

    const date = document.createElement('div');
    date.className = 'memo-date';

    date.textContent = formatMemoDate(memo.createdAt);

    card.append(content, date);

    if (editable) {

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
      card.appendChild(actions);

    } else {

      card.style.resize = 'none';
      card.style.cursor = 'default';
      card.style.touchAction = 'pan-y';
      card.style.userSelect = 'text';

    }

    memoBoard.appendChild(card);

    if (editable) {
      setupMemoDrag(card, memo);
      setupMemoResize(card, memo);
    }

  });

  renderStickers();
}


/* ==========================================
   메모 작성창
========================================== */

document.getElementById('add-memo-btn')
  .addEventListener('click', () => {

    if (!boardReady) {
      alert('게시판 연결 중입니다.');
      return;
    }

    editingId = null;

    document.getElementById('memo-content').value = '';

    selectedColor = 'yellow';

    updateColorSelection();

    modal.classList.add('open');

  });


document.getElementById('close-modal')
  .addEventListener('click', () => {

    modal.classList.remove('open');
    editingId = null;

  });


/* ==========================================
   메모 색상
========================================== */

function updateColorSelection() {

  document.querySelectorAll('.color-option')
    .forEach(btn => {

      btn.classList.toggle(
        'selected',
        btn.dataset.color === selectedColor
      );

    });
}

document.querySelectorAll('.color-option')
  .forEach(btn => {

    btn.addEventListener('click', () => {

      selectedColor = btn.dataset.color;
      updateColorSelection();

    });

  });


/* ==========================================
   메모 저장
========================================== */

document.getElementById('save-memo-btn')
  .addEventListener('click', async () => {

    const button =
      document.getElementById('save-memo-btn');

    const content = document
      .getElementById('memo-content')
      .value.trim();

    if (!content) {
      alert('메모 내용을 입력해 줘!');
      return;
    }

    if (button.disabled) return;

    button.disabled = true;
    button.textContent = '저장 중...';

    try {

      let success = false;

      if (editingId !== null) {

        const memo = memos.find(
          m => m.id === editingId
        );

        if (!memo || !canEditObject(memo)) {
          alert('수정 권한이 없습니다.');
          return;
        }

        success = await updateBoardObject({
          ...memo,
          content,
          color: selectedColor
        });

      } else {

      } else {

  const position = getBoardCenterPosition(
    220,
    185
  );

  success = await createBoardObject('memo', {

    content,
    color: selectedColor,

    x: position.x,
    y: position.y,

    width: 220,
    height: 185

  });

}

        success = await createBoardObject('memo', {

          content,
          color: selectedColor,

          x: Math.max(
            10,
            Math.min(
              Math.max(10, boardWidth - 240),
              (boardWidth - 240) / 2 + offset % 150
            )
          ),

          y: 20 + offset % 300,

          width: 220,
          height: 185

        });

      }

      if (success) {

        modal.classList.remove('open');
        editingId = null;

      }

    } catch (error) {

      alert('저장 실패: ' + error.message);

    } finally {

      button.disabled = false;
      button.textContent = '저장하기';

    }

  });


/* ==========================================
   메모 수정
========================================== */

function editMemo(id) {

  const memo = memos.find(m => m.id === id);

  if (!memo || !canEditObject(memo)) return;

  editingId = id;

  document.getElementById('memo-content').value =
    memo.content || '';

  selectedColor = memo.color || 'yellow';

  updateColorSelection();

  modal.classList.add('open');
}


/* ==========================================
   메모 삭제
========================================== */

async function deleteMemo(id) {

  const memo = memos.find(m => m.id === id);

  if (!memo || !canEditObject(memo)) return;

  if (!confirm('이 메모를 삭제할까?')) return;

  await deleteBoardObject(memo);
}


/* ==========================================
   메모 드래그
========================================== */

function setupMemoDrag(card, memo) {

  let startX = 0;
  let startY = 0;

  let originalX = 0;
  let originalY = 0;

  let dragging = false;

  card.addEventListener('pointerdown', e => {

    if (!canEditObject(memo)) return;
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;

    const rect = card.getBoundingClientRect();

    if (
      e.clientX > rect.right - 20 &&
      e.clientY > rect.bottom - 20
    ) {
      return;
    }

    dragging = true;

    beginInteraction();

    startX = e.clientX;
    startY = e.clientY;

    originalX = memo.x ?? 15;
    originalY = memo.y ?? 15;

    card.setPointerCapture(e.pointerId);

  });

  card.addEventListener('pointermove', e => {

    if (!dragging) return;

const dx = (e.clientX - startX) / boardScale;
const dy = (e.clientY - startY) / boardScale;

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

    if (
      memo.x !== originalX ||
      memo.y !== originalY
    ) {
      updateBoardObject(memo);
    }

    endInteraction();

  }

  card.addEventListener('pointerup', stopDragging);
  card.addEventListener('pointercancel', stopDragging);
  card.addEventListener('lostpointercapture', stopDragging);
}


/* ==========================================
   메모 크기 조절
========================================== */

function setupMemoResize(card, memo) {

  if (!window.ResizeObserver) return;

  let timer = null;
  let resizing = false;

  let lastWidth = card.offsetWidth;
  let lastHeight = card.offsetHeight;

  card.addEventListener('pointerdown', e => {

    const rect = card.getBoundingClientRect();

    if (
      e.clientX > rect.right - 20 &&
      e.clientY > rect.bottom - 20
    ) {

      if (!resizing) {
        resizing = true;
        beginInteraction();
      }

    }

  });

  function finishResize() {

    if (!resizing) return;

    resizing = false;

    clearTimeout(timer);

    saveSize();

    endInteraction();

  }

  function saveSize() {

    if (!card.isConnected) return;

    const width = card.offsetWidth;
    const height = card.offsetHeight;

    if (!width || !height) return;

    if (
      width === lastWidth &&
      height === lastHeight
    ) return;

    lastWidth = width;
    lastHeight = height;

    memo.width = width;
    memo.height = height;

    updateBoardObject(memo);

  }

  card.addEventListener('pointerup', finishResize);
  card.addEventListener('pointercancel', finishResize);
  card.addEventListener('pointerleave', finishResize);

  const observer = new ResizeObserver(() => {

    clearTimeout(timer);

    timer = setTimeout(() => {

      if (!resizing) saveSize();

    }, 350);

  });

  observer.observe(card);

  memoObservers.add(observer);
}


/* ==========================================
   관리자 로그인 상태
========================================== */

async function checkLogin() {

  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) {

    console.error(error);
    currentUser = null;

  } else {

    currentUser =
      data.session?.user?.id === ADMIN_ID
        ? data.session.user
        : null;

  }

  updateAdminUI();
}


/* ==========================================
   관리자 로그인 버튼
========================================== */

document.getElementById('admin-login-btn')
  .addEventListener('click', async () => {

    if (isAdmin()) {

      if (!confirm('로그아웃할까?')) return;

      const { error } =
        await supabaseClient.auth.signOut({
          scope: 'local'
        });

      if (error) {
        alert(error.message);
        return;
      }

      currentUser = null;

      updateAdminUI();

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


/* ==========================================
   관리자 로그인 실행
========================================== */

document.getElementById('login-submit-btn')
  .addEventListener('click', async () => {

    const email = document
      .getElementById('admin-email')
      .value.trim();

    const password = document
      .getElementById('admin-password')
      .value;

    const message =
      document.getElementById('login-message');

    const button =
      document.getElementById('login-submit-btn');

    if (button.disabled) return;

    button.disabled = true;

    message.textContent = '로그인 중...';

    try {

      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      if (data.user.id !== ADMIN_ID) {

        await supabaseClient.auth.signOut({
          scope: 'local'
        });

        currentUser = null;

        updateAdminUI();

        message.textContent = '관리자 계정이 아닙니다.';

        return;

      }

      currentUser = data.user;

      loginModal.classList.remove('open');

      updateAdminUI();

      await loadItems();
      await loadHistory();

      alert('관리자 로그인 성공!');

    } catch (error) {

      message.textContent =
        '로그인 실패: ' + error.message;

    } finally {

      button.disabled = false;

    }

  });


/* ==========================================
   관리자 UI
========================================== */

function updateAdminUI() {

  const admin = isAdmin();

  document.getElementById('admin-controls')
    ?.classList.toggle('hidden', !admin);

  document.getElementById('clear-history-btn')
    ?.classList.toggle('hidden', !admin);

  document.getElementById('item-list')
    ?.classList.toggle('hidden', !admin);

  const button =
    document.getElementById('admin-login-btn');

  if (button) {

    button.textContent = admin
      ? '관리자 로그아웃'
      : '관리자 로그인';

  }

  if (boardReady) {

    requestBoardRefresh();

  }
}


/* ==========================================
   랜덤 물건 목록
========================================== */

async function loadItems() {

  const list = document.getElementById('item-list');

  if (!list || !isAdmin()) return;

  const { data, error } = await supabaseClient
    .from('random_items')
    .select('name')
    .order('name');

  if (error) {

    list.textContent =
      '물건 목록을 불러오지 못했어.';

    console.error(error);

    return;

  }

  list.innerHTML = '';

  if (!data?.length) {

    list.textContent = '등록된 물건이 없어.';

    return;

  }

  data.forEach(item => {

    const tag = document.createElement('div');
    tag.className = 'item-tag';

    const name = document.createElement('span');
    name.textContent = item.name;

    const remove = document.createElement('button');

    remove.textContent = '×';
    remove.title = '삭제';

    remove.addEventListener('click', () => {
      deleteItem(item.name);
    });

    tag.append(name, remove);

    list.appendChild(tag);

  });
}


/* ==========================================
   경품 추가
========================================== */

document.getElementById('add-item-btn')
  ?.addEventListener('click', addItem);

document.getElementById('item-name')
  ?.addEventListener('keydown', e => {

    if (e.key === 'Enter') addItem();

  });


async function addItem() {

  if (!isAdmin()) {
    alert('관리자만 추가할 수 있어.');
    return;
  }

  const input = document.getElementById('item-name');
  const name = input.value.trim();

  if (!name) return;

  const { error } = await supabaseClient
    .from('random_items')
    .insert({ name });

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

  if (!isAdmin()) {

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
   슬롯머신 애니메이션
========================================== */

async function animateSlot(resultBox, items, prize) {

  const names = items.filter(
    name => typeof name === 'string' && name.trim()
  );

  if (!names.includes(prize)) {
    names.push(prize);
  }

  if (
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
  ) {

    resultBox.textContent = '';

    const span = document.createElement('span');

    span.textContent = prize;

    resultBox.appendChild(span);

    return;

  }

  resultBox.innerHTML = '';

  const slotWindow = document.createElement('div');

  slotWindow.className = 'slot-window';

  resultBox.appendChild(slotWindow);

  function createItem(name) {

    const item = document.createElement('div');

    item.className = 'slot-item';
    item.textContent = name;

    return item;

  }

  let currentItem = createItem(
    names[Math.floor(Math.random() * names.length)]
  );

  slotWindow.appendChild(currentItem);

  const durations = [
    65, 65, 65, 65, 65,
    65, 65, 65, 65, 65,
    65, 65, 65, 65, 65,
    70, 75, 85, 100, 120,
    150, 190, 240, 320, 450
  ];

  for (let i = 0; i < durations.length; i++) {

    const isLast = i === durations.length - 1;

    const candidates = names.filter(
      name => name !== currentItem.textContent
    );

    const pool = candidates.length
      ? candidates
      : names;

    const nextName = isLast
      ? prize
      : pool[Math.floor(Math.random() * pool.length)];

    const nextItem = createItem(nextName);

    slotWindow.appendChild(nextItem);

    const options = {

      duration: durations[i],

      easing: isLast
        ? 'cubic-bezier(0.15, 0.7, 0.25, 1)'
        : 'linear',

      fill: 'forwards'

    };

    const outgoing = currentItem.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(100%)' }
      ],
      options
    );

    const incoming = nextItem.animate(
      [
        { transform: 'translateY(-100%)' },
        { transform: 'translateY(0)' }
      ],
      options
    );

    await Promise.all([
      outgoing.finished,
      incoming.finished
    ]);

    currentItem.remove();

    nextItem.style.transform = 'translateY(0)';

    incoming.cancel();

    currentItem = nextItem;

  }
}


/* ==========================================
   랜덤 뽑기
========================================== */

document.getElementById('draw-btn')
  ?.addEventListener('click', drawPrize);


async function drawPrize() {

  const button = document.getElementById('draw-btn');
  const resultBox = document.getElementById('draw-result');

  const description =
    document.getElementById('draw-description');

  const status =
    document.getElementById('draw-status');

  if (button.disabled) return;

  button.disabled = true;
  button.textContent = '추첨 중...';

  status.textContent = '';

  resultBox.classList.remove('revealed');
  resultBox.classList.add('drawing');

  try {

    const {
      data: itemData,
      error: itemError
    } = await supabaseClient
      .from('random_items')
      .select('name');

    if (itemError) {

      throw new Error(
        '아이템 목록을 불러오지 못했습니다: '
        + itemError.message
      );

    }

    const itemNames = (itemData || [])
      .map(item => item.name);

    const { data, error } =
      await supabaseClient.functions.invoke(
        'smooth-function',
        {
          method: 'POST'
        }
      );

    if (error) throw error;

    if (data?.already_drawn) {

      status.textContent =
        '오늘은 이미 뽑기를 완료했어! 내일 다시 도전해 줘.';

      return;

    }

    if (data?.error === 'NO_ITEMS') {

      status.textContent = '뽑을 물건이 없어!';

      return;

    }

    if (!data?.success || !data?.prize_name) {

      throw new Error(
        data?.error || '뽑기에 실패했어.'
      );

    }

    const prize = data.prize_name;

    description.textContent =
      '오늘의 선물을 추첨하고 있습니다.';

    status.textContent = 'PLEASE WAIT...';

    try {

      await animateSlot(
        resultBox,
        itemNames,
        prize
      );

    } catch (animationError) {

      console.error(animationError);

      resultBox.textContent = '';

      const span = document.createElement('span');

      span.textContent = prize;

      resultBox.appendChild(span);

    }

    resultBox.classList.remove('drawing');
    resultBox.classList.add('revealed');

    description.textContent =
      '오늘 선택된 물건은 ' + prize + ' 입니다.';

    status.textContent =
      '✦ 오늘의 뽑기를 완료했어! ✦';

    await loadHistory();

  } catch (error) {

    console.error('추첨 오류:', error);

    status.textContent =
      '추첨 오류: ' +
      (error.message || '다시 시도해 줘.');

  } finally {

    resultBox.classList.remove('drawing');

    button.disabled = false;
    button.textContent = '물건 뽑기';

  }
}


/* ==========================================
   뽑기 기록
========================================== */

async function loadHistory() {

  const container =
    document.getElementById('draw-history');

  container.textContent =
    '기록을 불러오는 중...';

  const { data, error } = await supabaseClient
    .from('draw_history')
    .select('prize_name, drawn_at')
    .order('drawn_at', { ascending: false })
    .limit(100);

  if (error) {

    container.textContent =
      '기록을 불러오지 못했어.';

    console.error(error);

    return;

  }

  container.innerHTML = '';

  if (!data?.length) {

    container.textContent =
      '아직 뽑기 기록이 없어.';

    return;

  }

  data.forEach(record => {

    const row = document.createElement('div');

    row.className = 'history-item';

    const name = document.createElement('strong');

    name.textContent = record.prize_name;

    const date = document.createElement('span');

    date.textContent =
      formatMemoDate(record.drawn_at);

    row.append(name, date);

    container.appendChild(row);

  });
}


/* ==========================================
   뽑기 기록 삭제
========================================== */

document.getElementById('clear-history-btn')
  ?.addEventListener('click', clearHistory);


async function clearHistory() {

  if (!isAdmin()) {

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
   이모지 목록
========================================== */

const emojiCategories = {

  얼굴: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 🥹 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🫣 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 👾 🤖 🎃',

  동물: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🦈 🐊 🦭 🦦 🦥 🐘 🦣 🦏 🦛 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦔 🐾',

  식물: '🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🍄 🪺 🪻 🌷 🪷 🌹 🥀 🌺 🌸 🌼 🌻 🌞',

  음식: '🍇 🍈 🍉 🍊 🍋 🍌 🍍 🥭 🍎 🍏 🍐 🍑 🍒 🍓 🫐 🥝 🍅 🫒 🥥 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍷 🥂 🍹 🧉',

  사물: '⌚ 📱 💻 🖥️ 🖨️ ⌨️ 🖱️ 💽 💾 💿 📷 📸 📹 🎥 📺 📻 🎙️ 🎧 🎤 📢 📣 🔔 🔕 🕯️ 💡 🔦 🏮 📔 📕 📖 📗 📘 📙 📚 📓 📒 📃 📜 📰 🗞️ 🔖 🏷️ 💰 💴 💵 💶 💷 💳 💎 ⚖️ 🧸 🪆 🪄 🎀 🎁 🎈 🎉 🎊 🎏 🎐 🪩 🪅 🖼️ 🪞 🛍️',

  기호: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☯️ ✡️ 🕉️ ☸️ 🔯 🪯 ☪️ ☦️ 🛐 ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💯 🔥 ✨ ⭐ 🌟 💫 ☀️ 🌙 ☁️ 🌈 ❄️ ⚡ 💧 💦 🌊 🎵 🎶 💭 💤',

  활동: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤸 🤼 🤽 🤾 🧗 🚴 🚵 🤹 🏇 🧘 🏄 🏊',

  교통: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛹 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓'

};

const allEmojis = [
  ...new Set(
    Object.values(emojiCategories)
      .flatMap(category => category.split(' '))
  )
];


/* ==========================================
   이모지 선택창
========================================== */

function renderEmojiList(search = '') {

  emojiList.innerHTML = '';

  const filtered = search

    ? [
        ...new Set(
          Object.entries(emojiCategories)
            .filter(([category]) =>
              category.includes(search)
            )
            .flatMap(([, values]) => values.split(' '))
            .concat(
              allEmojis.filter(emoji =>
                emoji.includes(search)
              )
            )
        )
      ]

    : allEmojis;

  filtered.forEach(emoji => {

    const button = document.createElement('button');

    button.className = 'emoji-choice';
    button.textContent = emoji;
    button.type = 'button';

    button.addEventListener('click', async () => {

      if (button.disabled) return;

      button.disabled = true;

      try {

        const success = await addSticker(emoji);

        if (success) {

          emojiPicker.classList.add('hidden');

          emojiSearch.value = '';

          renderEmojiList();

        }

      } finally {

        button.disabled = false;

      }

    });

    emojiList.appendChild(button);

  });
}


document.getElementById('add-sticker-btn')
  .addEventListener('click', () => {

    if (!boardReady) {

      alert('게시판 연결 중입니다.');
      return;

    }

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
   스티커 추가
========================================== */

async function addSticker(emoji) {

  const position = getBoardCenterPosition(
    48,
    48
  );

  return await createBoardObject('sticker', {

    emoji,

    x: position.x,
    y: position.y,

    size: 48,

    rotation: 0

  });

}

/* ==========================================
   스티커 표시
========================================== */

function renderStickers() {

  memoBoard.querySelectorAll('.sticker')
    .forEach(el => el.remove());

  stickers.forEach(sticker => {

    const el = document.createElement('div');

    el.className = 'sticker';

    el.dataset.id = sticker.id;

    el.textContent = sticker.emoji;

    el.style.left = (sticker.x ?? 80) + 'px';

    el.style.top = (sticker.y ?? 80) + 'px';

    el.style.fontSize = (sticker.size || 48) + 'px';

    el.style.setProperty(
      'z-index',
      String(Number(sticker.zIndex) || 1),
      'important'
    );

    el.style.transform =
      `rotate(${sticker.rotation || 0}deg)`;

    memoBoard.appendChild(el);

    if (canEditObject(sticker)) {

      setupStickerDrag(el, sticker);

      setupStickerControls(el, sticker);

    } else {

      el.style.cursor = 'default';

      el.style.touchAction = 'pan-y';

    }

  });
}


/* ==========================================
   스티커 이동
========================================== */

function setupStickerDrag(el, sticker) {

  let startX = 0;
  let startY = 0;

  let originalX = 0;
  let originalY = 0;

  let dragging = false;

  el.addEventListener('pointerdown', e => {

    if (!canEditObject(sticker)) return;

    if (e.button !== 0) return;

    if (e.target.closest('.sticker-controls')) return;

    dragging = true;

    beginInteraction();

    startX = e.clientX;
    startY = e.clientY;

    originalX = sticker.x ?? 80;
    originalY = sticker.y ?? 80;

    el.setPointerCapture(e.pointerId);

  });

  el.addEventListener('pointermove', e => {

    if (!dragging) return;

    const maxX = Math.max(
      0,
      memoBoard.clientWidth - el.offsetWidth
    );

    const maxY = Math.max(
      0,
      memoBoard.clientHeight - el.offsetHeight
    );

    sticker.x = Math.max(
      0,
      Math.min(
        maxX,
       originalX + (e.clientX - startX) / boardScale
      )
    );

    sticker.y = Math.max(
      0,
      Math.min(
        maxY,
originalY + (e.clientY - startY) / boardScale
      )
    );

    el.style.left = sticker.x + 'px';

    el.style.top = sticker.y + 'px';

  });

  function stopDragging() {

    if (!dragging) return;

    dragging = false;

    if (
      sticker.x !== originalX ||
      sticker.y !== originalY
    ) {

      updateBoardObject(sticker);

    }

    endInteraction();

  }

  el.addEventListener('pointerup', stopDragging);

  el.addEventListener('pointercancel', stopDragging);

  el.addEventListener('lostpointercapture', stopDragging);

}


/* ==========================================
   스티커 조작 버튼
========================================== */

function setupStickerControls(el, sticker) {

  if (!canEditObject(sticker)) return;

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

  controls.addEventListener('pointerdown', e => {

    e.stopPropagation();

  });

  smaller.addEventListener('click', e => {

    e.stopPropagation();

    if (!canEditObject(sticker)) return;

    sticker.size = Math.max(
      20,
      (sticker.size || 48) - 8
    );

    el.style.fontSize = sticker.size + 'px';

    updateBoardObject(sticker);

  });

  bigger.addEventListener('click', e => {

    e.stopPropagation();

    if (!canEditObject(sticker)) return;

    sticker.size = Math.min(
      150,
      (sticker.size || 48) + 8
    );

    el.style.fontSize = sticker.size + 'px';

    updateBoardObject(sticker);

  });

  rotate.addEventListener('click', e => {

    e.stopPropagation();

    if (!canEditObject(sticker)) return;

    sticker.rotation =
      ((sticker.rotation || 0) + 15) % 360;

    el.style.transform =
      `rotate(${sticker.rotation}deg)`;

    updateBoardObject(sticker);

  });

  remove.addEventListener('click', async e => {

    e.stopPropagation();

    if (!canEditObject(sticker)) return;

    if (!confirm('이 스티커를 삭제할까?')) return;

    await deleteBoardObject(sticker);

  });

  controls.append(
    smaller,
    bigger,
    rotate,
    remove
  );

  el.appendChild(controls);

}


/* ==========================================
   초기 실행
========================================== */

async function initializeSite() {

  await checkLogin();

  try {

    await initializeBoard();

  } catch (error) {

    boardReady = false;

    console.error('게시판 연결 오류:', error);

    memoBoard.textContent =
      '게시판을 불러오지 못했습니다: '
      + error.message;

  }

  await loadItems();

  await loadHistory();

}

initializeSite().catch(error => {

  console.error('사이트 초기화 오류:', error);

});
/* ==========================================
   게시판 캔버스 확대 및 이동
========================================== */

const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1600;

const MIN_BOARD_SCALE = 0.15;
const MAX_BOARD_SCALE = 2.5;

const boardViewport =
  document.getElementById('board-viewport');

let boardScale = 1;

let boardPanX = 0;
let boardPanY = 0;

let boardPointers = new Map();

let boardGesture = null;


/* ==========================================
   화면 변환 적용
========================================== */

function applyBoardTransform() {

  memoBoard.style.setProperty(
    'position',
    'absolute',
    'important'
  );

  memoBoard.style.transform =
    `translate(${boardPanX}px, ${boardPanY}px)
     scale(${boardScale})`;

  document.getElementById(
    'board-zoom-level'
  ).textContent =
    Math.round(boardScale * 100) + '%';

}


/* ==========================================
   확대 범위 제한
========================================== */

function clampBoardScale(value) {

  return Math.max(
    MIN_BOARD_SCALE,
    Math.min(MAX_BOARD_SCALE, value)
  );

}


/* ==========================================
   특정 지점을 기준으로 확대
========================================== */

function zoomBoardAt(
  newScale,
  screenX,
  screenY
) {

  newScale = clampBoardScale(newScale);

  const worldX =
    (screenX - boardPanX) / boardScale;

  const worldY =
    (screenY - boardPanY) / boardScale;

  boardScale = newScale;

  boardPanX =
    screenX - worldX * boardScale;

  boardPanY =
    screenY - worldY * boardScale;

  applyBoardTransform();

}


/* ==========================================
   전체 게시판 보기
========================================== */

function resetBoardView() {

  const width = boardViewport.clientWidth;
  const height = boardViewport.clientHeight;

  if (!width || !height) return;

  boardScale = clampBoardScale(
    Math.min(
      width / BOARD_WIDTH,
      height / BOARD_HEIGHT
    ) * 0.96
  );

  boardPanX =
    (width - BOARD_WIDTH * boardScale) / 2;

  boardPanY =
    (height - BOARD_HEIGHT * boardScale) / 2;

  applyBoardTransform();

}


/* ==========================================
   화면 중앙 기준 확대 및 축소
========================================== */

function zoomBoardCenter(multiplier) {

  zoomBoardAt(
    boardScale * multiplier,
    boardViewport.clientWidth / 2,
    boardViewport.clientHeight / 2
  );

}

document.getElementById('board-zoom-in')
  .addEventListener('click', () => {

    zoomBoardCenter(1.25);

  });

document.getElementById('board-zoom-out')
  .addEventListener('click', () => {

    zoomBoardCenter(0.8);

  });

document.getElementById('board-reset')
  .addEventListener('click', resetBoardView);


/* ==========================================
   PC 마우스 휠 확대 및 축소
========================================== */

boardViewport.addEventListener(
  'wheel',
  e => {

    e.preventDefault();

    const rect =
      boardViewport.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const factor =
      Math.exp(-e.deltaY * 0.0015);

    zoomBoardAt(
      boardScale * factor,
      x,
      y
    );

  },
  { passive: false }
);


/* ==========================================
   포인터 좌표 계산
========================================== */

function getBoardPoint(e) {

  const rect =
    boardViewport.getBoundingClientRect();

  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

}

function getPointerDistance(a, b) {

  return Math.hypot(
    b.x - a.x,
    b.y - a.y
  );

}

function getPointerCenter(a, b) {

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };

}


/* ==========================================
   화면 이동 시작
========================================== */

boardViewport.addEventListener(
  'pointerdown',
  e => {

    if (e.button !== 0) return;

    const object = e.target.closest(
      '.memo, .sticker'
    );

    const point = getBoardPoint(e);

    /*
      본인 메모 및 스티커의 기존 조작 기능 유지
    */

    if (object) {

      const item = [
        ...memos,
        ...stickers
      ].find(
        item => String(item.id) === object.dataset.id
      );

      if (
        item &&
        canEditObject(item) &&
        boardPointers.size === 0
      ) {
        return;
      }

    }

    boardPointers.set(
      e.pointerId,
      point
    );

    boardViewport.setPointerCapture(
      e.pointerId
    );

    boardViewport.classList.add(
      'is-panning'
    );

    if (boardPointers.size === 1) {

      boardGesture = {

        type: 'pan',

        startX: point.x,
        startY: point.y,

        originalX: boardPanX,
        originalY: boardPanY

      };

    }

    if (boardPointers.size === 2) {

      const [a, b] =
        [...boardPointers.values()];

      const center =
        getPointerCenter(a, b);

      boardGesture = {

        type: 'pinch',

        distance: Math.max(
          1,
          getPointerDistance(a, b)
        ),

        scale: boardScale,

        worldX:
          (center.x - boardPanX) / boardScale,

        worldY:
          (center.y - boardPanY) / boardScale

      };

    }

  }
);


/* ==========================================
   화면 이동 및 모바일 핀치 확대
========================================== */

boardViewport.addEventListener(
  'pointermove',
  e => {

    if (!boardPointers.has(e.pointerId)) {
      return;
    }

    const point = getBoardPoint(e);

    boardPointers.set(
      e.pointerId,
      point
    );

    if (!boardGesture) return;

    if (
      boardPointers.size === 1 &&
      boardGesture.type === 'pan'
    ) {

      boardPanX =
        boardGesture.originalX +
        point.x -
        boardGesture.startX;

      boardPanY =
        boardGesture.originalY +
        point.y -
        boardGesture.startY;

      applyBoardTransform();

    }

    if (
      boardPointers.size >= 2 &&
      boardGesture.type === 'pinch'
    ) {

      const [a, b] =
        [...boardPointers.values()];

      const distance =
        getPointerDistance(a, b);

      const center =
        getPointerCenter(a, b);

      boardScale = clampBoardScale(
        boardGesture.scale *
        distance /
        boardGesture.distance
      );

      boardPanX =
        center.x -
        boardGesture.worldX * boardScale;

      boardPanY =
        center.y -
        boardGesture.worldY * boardScale;

      applyBoardTransform();

    }

  }
);


/* ==========================================
   화면 이동 종료
========================================== */

function stopBoardGesture(e) {

  if (!boardPointers.has(e.pointerId)) {
    return;
  }

  boardPointers.delete(e.pointerId);

  if (boardPointers.size === 0) {

    boardGesture = null;

    boardViewport.classList.remove(
      'is-panning'
    );

    return;

  }

  if (boardPointers.size === 1) {

    const [point] =
      [...boardPointers.values()];

    boardGesture = {

      type: 'pan',

      startX: point.x,
      startY: point.y,

      originalX: boardPanX,
      originalY: boardPanY

    };

  }

}

boardViewport.addEventListener(
  'pointerup',
  stopBoardGesture
);

boardViewport.addEventListener(
  'pointercancel',
  stopBoardGesture
);

boardViewport.addEventListener(
  'lostpointercapture',
  stopBoardGesture
);


/* ==========================================
   현재 화면 중앙의 실제 게시판 좌표
========================================== */

function getBoardCenterPosition(
  objectWidth = 220,
  objectHeight = 185
) {

  const x =
    (
      boardViewport.clientWidth / 2 -
      boardPanX
    ) / boardScale -
    objectWidth / 2;

  const y =
    (
      boardViewport.clientHeight / 2 -
      boardPanY
    ) / boardScale -
    objectHeight / 2;

  return {

    x: Math.max(
      0,
      Math.min(
        BOARD_WIDTH - objectWidth,
        x
      )
    ),

    y: Math.max(
      0,
      Math.min(
        BOARD_HEIGHT - objectHeight,
        y
      )
    )

  };

}


/* ==========================================
   최초 게시판 화면 설정
========================================== */

requestAnimationFrame(() => {

  resetBoardView();

});
