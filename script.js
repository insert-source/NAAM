/* ==================================
   데이터 저장
================================== */

let memos = JSON.parse(localStorage.getItem('memos')) || [];

let items = JSON.parse(localStorage.getItem('randomItems')) || [
  '손전등',
  '우산',
  '손목시계',
  '열쇠',
  '책',
  '나침반',
  '손거울',
  '라이터',
  '붕대',
  '물병',
  '수첩',
  '동전',
  '카메라',
  '장갑',
  '가위',
  '편지',
  '빗',
  '목걸이',
  '인형',
  '향수'
];

let history = JSON.parse(localStorage.getItem('drawHistory')) || [];

let selectedColor = 'yellow';
let editingId = null;


/* ==================================
   탭 전환
================================== */

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

  });

});


/* ==================================
   메모장
================================== */

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

    card.className = `memo ${memo.color}`;
    card.dataset.id = memo.id;

    const title = document.createElement('h3');
    title.textContent = memo.title;

    const content = document.createElement('p');
    content.textContent = memo.content;

    const date = document.createElement('div');
    date.className = 'memo-date';
    date.textContent = memo.date;

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

    memoBoard.appendChild(card);

  });

}


document.getElementById('add-memo-btn').addEventListener('click', () => {

  editingId = null;

  document.getElementById('memo-title').value = '';
  document.getElementById('memo-content').value = '';

  selectedColor = 'yellow';

  updateColorSelection();

  modal.classList.add('open');

});


document.getElementById('close-modal').addEventListener('click', () => {
  modal.classList.remove('open');
});


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


document.getElementById('save-memo-btn').addEventListener('click', () => {

  const title = document.getElementById('memo-title').value.trim();
  const content = document.getElementById('memo-content').value.trim();

  if (!title && !content) {
    alert('메모 내용을 입력해 줘!');
    return;
  }

  if (editingId !== null) {

    const memo = memos.find(m => m.id === editingId);

    memo.title = title || '제목 없음';
    memo.content = content;
    memo.color = selectedColor;

  } else {

    memos.push({

      id: Date.now(),

      title: title || '제목 없음',

      content: content,

      color: selectedColor,

      date: new Date().toLocaleDateString('ko-KR')

    });

  }

  saveMemos();

  renderMemos();

  modal.classList.remove('open');

});


function editMemo(id) {

  const memo = memos.find(m => m.id === id);

  if (!memo) return;

  editingId = id;

  document.getElementById('memo-title').value = memo.title;
  document.getElementById('memo-content').value = memo.content;

  selectedColor = memo.color;

  updateColorSelection();

  modal.classList.add('open');

}


function deleteMemo(id) {

  if (!confirm('이 메모를 삭제할까?')) return;

  memos = memos.filter(m => m.id !== id);

  saveMemos();

  renderMemos();

}


/* ==================================
   랜덤 물건 뽑기
================================== */

function saveItems() {

  localStorage.setItem(
    'randomItems',
    JSON.stringify(items)
  );

}


function renderItems() {

  const list = document.getElementById('item-list');

  list.innerHTML = '';

  items.forEach((item, index) => {

    const tag = document.createElement('div');

    tag.className = 'item-tag';

    const name = document.createElement('span');
    name.textContent = item;

    const remove = document.createElement('button');
    remove.textContent = '×';

    remove.addEventListener('click', () => {

      items.splice(index, 1);

      saveItems();

      renderItems();

    });

    tag.append(name, remove);

    list.appendChild(tag);

  });

}


document.getElementById('add-item-btn').addEventListener('click', addItem);


document.getElementById('item-name').addEventListener('keydown', e => {

  if (e.key === 'Enter') {
    addItem();
  }

});


function addItem() {

  const input = document.getElementById('item-name');

  const name = input.value.trim();

  if (!name) return;

  items.push(name);

  input.value = '';

  saveItems();

  renderItems();

}


document.getElementById('draw-btn').addEventListener('click', () => {

  if (items.length === 0) {

    alert('뽑을 물건이 없어! 물건을 추가해 줘.');

    return;

  }

  const result = items[
    Math.floor(Math.random() * items.length)
  ];

  document.getElementById('draw-result').innerHTML = '';

  const resultText = document.createElement('span');
  resultText.textContent = result;

  document.getElementById('draw-result').appendChild(resultText);

  document.getElementById('draw-description').textContent =
    '오늘 선택된 물건은 ' + result + ' 입니다.';

  history.unshift({

    name: result,

    date: new Date().toLocaleString('ko-KR')

  });

  saveHistory();

  renderHistory();

});


/* ==================================
   뽑기 기록
================================== */

function saveHistory() {

  localStorage.setItem(
    'drawHistory',
    JSON.stringify(history)
  );

}


function renderHistory() {

  const container = document.getElementById('draw-history');

  container.innerHTML = '';

  history.forEach(record => {

    const row = document.createElement('div');

    row.className = 'history-item';

    const name = document.createElement('strong');
    name.textContent = record.name;

    const date = document.createElement('span');
    date.textContent = record.date;

    row.append(name, date);

    container.appendChild(row);

  });

}


document.getElementById('clear-history-btn').addEventListener('click', () => {

  if (!confirm('뽑기 기록을 전부 삭제할까?')) return;

  history = [];

  saveHistory();

  renderHistory();

});


/* ==================================
   초기 실행
================================== */

renderMemos();

renderItems();

renderHistory();
