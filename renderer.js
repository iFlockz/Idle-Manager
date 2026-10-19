const { ipcRenderer } = require('electron');

const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');
const windowTitle = document.getElementById('window-title');

const startScreen = document.getElementById('start-screen');
const initialUrlInput = document.getElementById('initial-url'); 
const btnStart = document.getElementById('btn-start');

const webviewsContainer = document.getElementById('webviews-container');
const floatingBubble = document.getElementById('floating-bubble');
const bubbleIcon = document.getElementById('bubble-icon');
const bubbleMenu = document.getElementById('bubble-menu');
const gamesList = document.getElementById('games-list');
const btnAddNew = document.getElementById('btn-add-new');
const addForm = document.getElementById('add-form');
const newGameUrlInput = document.getElementById('new-game-url');
const btnConfirmAdd = document.getElementById('btn-confirm-add');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const appContainer = document.getElementById('app-container');

const btnSplitMinus = document.getElementById('split-minus');
const btnSplitPlus = document.getElementById('split-plus');
const splitCounter = document.getElementById('split-counter');

let savedGames = [];
let currentActiveUrl = null;
const webviewElements = new Map();

let activeGridCount = 1;
let nextGameId = 1;

const STATE_STORAGE_KEY = 'idle-manager-state-v1';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.games)) return;

    savedGames = normalizeSavedGames(parsed.games);

    const parsedCount = Number(parsed.activeGridCount);
    if (Number.isFinite(parsedCount) && parsedCount >= 1) {
      activeGridCount = Math.min(50, Math.max(1, Math.round(parsedCount)));
    }
  } catch (error) {
    console.error('Erro ao restaurar estado salvo:', error);
  }
}

function savePersistedState() {
  try {
    const payload = {
      games: savedGames.map(game => ({
        id: game.id,
        title: game.title,
        url: game.url,
        customName: game.customName || ''
      })),
      activeGridCount
    };

    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Erro ao salvar estado:', error);
  }
}

function generateGameId() {
  return `game-${Date.now()}-${Math.random().toString(16).slice(2)}-${nextGameId++}`;
}

function getGamePartition(gameId) {
  return `persist:idle-manager-${String(gameId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function normalizeSavedGames(games = []) {
  const normalized = [];
  const seenIds = new Set();

  games.forEach((game, index) => {
    let id = game && game.id ? String(game.id) : null;

    if (!id || seenIds.has(id)) {
      id = generateGameId();
    }

    seenIds.add(id);

    const customName = game && (game.customName ?? game.displayName ?? '');

    normalized.push({
      id,
      title: game && game.title ? game.title : (game && game.url ? game.url : `Site ${index + 1}`),
      url: game && game.url ? game.url : '',
      customName: typeof customName === 'string' ? customName.trim() : ''
    });
  });

  return normalized;
}

btnMinimize.addEventListener('click', () => ipcRenderer.send('window-minimize'));
btnMaximize.addEventListener('click', () => ipcRenderer.send('window-maximize'));
btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));

window.addEventListener('DOMContentLoaded', async () => {
  loadPersistedState();
  renderGamesList();
  updateWebviewsLayout();

  if (savedGames.length > 0) {
    const firstGame = savedGames[0];
    loadGame(firstGame.url, firstGame.title, firstGame.id);
  } else {
    startScreen.classList.remove('hidden');
    floatingBubble.classList.add('hidden');
    windowTitle.textContent = 'Web Player';
  }
});

function loadGame(url, customTitle = null, gameId = null) {
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  let targetId = gameId;
  let currentGame = null;

  if (targetId) {
    currentGame = savedGames.find(g => g.id === targetId);
  }

  if (!currentGame) {
    targetId = generateGameId();
    currentGame = {
      id: targetId,
      title: customTitle || url,
      url: url,
      customName: ''
    };
    savedGames.push(currentGame);
    savePersistedState();
  }

  let webview = webviewElements.get(targetId);
  if (!webview) {
    webview = document.createElement('webview');
    const partitionName = getGamePartition(targetId);
    webview.setAttribute('partition', partitionName);
    webview.src = url;
    webviewElements.set(targetId, webview);
    webviewsContainer.appendChild(webview);

    webview.addEventListener('page-title-updated', (e) => {
      const gameToUpdate = savedGames.find(g => g.id === targetId);
      if (gameToUpdate && gameToUpdate.title !== e.title) {
        gameToUpdate.title = e.title;
        savePersistedState();
        renderGamesList();
      }
      if (currentActiveUrl === targetId) {
        windowTitle.textContent = e.title;
      }
    });
  }

  currentActiveUrl = targetId;
  startScreen.classList.add('hidden');
  floatingBubble.classList.remove('hidden');

  windowTitle.textContent = customTitle || currentGame.title;

  updateWebviewsLayout();
  renderGamesList();
}

function updateWebviewsLayout() {
  webviewElements.forEach((wv) => {
    wv.classList.remove('active', 'grid-view');
  });

  const visibleGames = savedGames.slice(0, activeGridCount);
  const visibleIds = visibleGames.map(g => g.id);

  if (visibleIds.length === 0) {
    webviewsContainer.classList.add('hidden');
    webviewsContainer.className = 'layout-grid count-0 hidden';
    startScreen.classList.remove('hidden');
    floatingBubble.classList.add('hidden');
    windowTitle.textContent = 'Web Player';
    return;
  }

  webviewsContainer.classList.remove('hidden');

  if (!currentActiveUrl || !visibleIds.includes(currentActiveUrl)) {
    currentActiveUrl = visibleIds[0];
  }

  webviewsContainer.className = `layout-grid count-${Math.min(visibleIds.length, 50)}`;

  visibleIds.forEach((id, index) => {
    let wv = webviewElements.get(id);
    const game = savedGames.find(g => g.id === id);
    
    if (!wv && game) {
      wv = document.createElement('webview');
      wv.setAttribute('partition', getGamePartition(id));
      wv.src = game.url;
      webviewElements.set(id, wv);
      webviewsContainer.appendChild(wv);
    }
    
    if (wv) {
      wv.classList.add('active', 'grid-view');
      wv.style.order = index;
    }
  });

  splitCounter.textContent = `${activeGridCount} ${activeGridCount === 1 ? 'Janela' : 'Janelas'}`;
}

btnSplitPlus.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activeGridCount < 50) {
    activeGridCount++;
    updateWebviewsLayout();
    syncAndSaveExternalConfig();
  }
});

btnSplitMinus.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activeGridCount > 1) {
    activeGridCount--;
    updateWebviewsLayout();
    syncAndSaveExternalConfig();
  }
});

function destroyGameView(id) {
  const webview = webviewElements.get(id);
  if (webview) {
    webview.remove();
    webviewElements.delete(id);
  }

  if (currentActiveUrl === id) {
    currentActiveUrl = null;
    if (savedGames.length > 0) {
      loadGame(savedGames[0].url, savedGames[0].title, savedGames[0].id);
    } else {
      startScreen.classList.remove('hidden');
      windowTitle.textContent = 'Web Player';
      bubbleMenu.classList.add('hidden');
      floatingBubble.classList.add('hidden');
    }
  }

  updateWebviewsLayout();
  renderGamesList();
}

btnStart.addEventListener('click', () => {
  const url = initialUrlInput.value.trim();
  if (url) {
    loadGame(url);
    initialUrlInput.value = '';
  }
});

initialUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') btnStart.click();
});

btnAddNew.addEventListener('click', () => {
  btnAddNew.classList.add('hidden');
  addForm.classList.remove('hidden');
  newGameUrlInput.focus();
});

btnCancelAdd.addEventListener('click', () => {
  addForm.classList.add('hidden');
  btnAddNew.classList.remove('hidden');
  newGameUrlInput.value = '';
});

btnConfirmAdd.addEventListener('click', () => {
  const url = newGameUrlInput.value.trim();
  if (url) {
    loadGame(url);
    addForm.classList.add('hidden');
    btnAddNew.classList.remove('hidden');
    newGameUrlInput.value = '';
    bubbleMenu.classList.add('hidden');
  }
});

newGameUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') btnConfirmAdd.click();
});

function renameGame(gameId) {
  const game = savedGames.find(item => item.id === gameId);
  if (!game) return;

  const titleSpan = document.querySelector(`#games-list li[data-game-id="${CSS.escape(gameId)}"] .title`);
  if (!titleSpan) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = game.customName || game.title || game.url;
  input.className = 'favorite-edit-input';
  input.maxLength = 80;

  const parent = titleSpan.parentElement;
  parent.replaceChild(input, titleSpan);
  input.focus();
  input.select();

  const finishEditing = () => {
    const nextValue = input.value.trim();
    game.customName = nextValue || '';
    saveGamesToStorage();
    renderGamesList();
  };

  input.addEventListener('blur', finishEditing, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditing();
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      renderGamesList();
    }
  });
}

function renderGamesList() {
  gamesList.innerHTML = '';
  
  savedGames.forEach((game, index) => {
    const li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.dataset.index = index;
    li.dataset.gameId = game.id;
    
    if (index < activeGridCount) {
      li.classList.add('active-game');
    }

    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = game.customName || game.title || game.url;
    titleSpan.addEventListener('click', () => {
      loadGame(game.url, game.title, game.id);
      bubbleMenu.classList.add('hidden');
    });

    const actions = document.createElement('div');
    actions.className = 'list-actions';

    const editBtn = document.createElement('span');
    editBtn.className = 'btn-edit';
    editBtn.textContent = '✎';
    editBtn.title = 'Editar nome do favorito';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renameGame(game.id);
    });

    const removeBtn = document.createElement('span');
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Excluir';
    
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteConfirmation(li, game);
    });

    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);

    li.appendChild(titleSpan);
    li.appendChild(actions);

    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', index);
      li.classList.add('dragging');
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('#games-list li').forEach(item => item.classList.remove('drag-over'));
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      li.classList.add('drag-over');
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');

      const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const targetIndex = index;

      if (draggedIndex !== targetIndex) {
        const movedItem = savedGames.splice(draggedIndex, 1)[0];
        savedGames.splice(targetIndex, 0, movedItem);

        saveGamesToStorage();
        renderGamesList();
        updateWebviewsLayout();
        syncAndSaveExternalConfig();
      }
    });

    gamesList.appendChild(li);
  });
}

function showDeleteConfirmation(liElement, game) {
  liElement.innerHTML = '';
  liElement.classList.add('deleting');

  const confirmText = document.createElement('span');
  confirmText.className = 'confirm-text';
  confirmText.textContent = 'Confirmar?';

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'delete-actions';

  const btnYes = document.createElement('span');
  btnYes.className = 'btn-confirm-yes';
  btnYes.textContent = '✓';
  btnYes.addEventListener('click', (e) => {
    e.stopPropagation();
    savedGames = savedGames.filter(g => g.id !== game.id);
    saveGamesToStorage();
    destroyGameView(game.id); // <-- Usando o id aqui
    syncAndSaveExternalConfig();
  });

  const btnNo = document.createElement('span');
  btnNo.className = 'btn-confirm-no';
  btnNo.textContent = '✕';
  btnNo.addEventListener('click', (e) => {
    e.stopPropagation();
    renderGamesList();
  });

  actionsDiv.appendChild(btnYes);
  actionsDiv.appendChild(btnNo);

  liElement.appendChild(confirmText);
  liElement.appendChild(actionsDiv);
}

function saveGamesToStorage() {
  savePersistedState();
}

async function syncAndSaveExternalConfig() {
  savePersistedState();
}

window.addEventListener('beforeunload', () => {
  savePersistedState();
});

let isDragging = false;
let startX, startY;
let pointerOffsetX = 0;
let pointerOffsetY = 0;
let activePointerId = null;

bubbleIcon.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;

  e.preventDefault();
  isDragging = false;
  activePointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;

  const bubbleRect = floatingBubble.getBoundingClientRect();
  const containerRect = appContainer.getBoundingClientRect();

  pointerOffsetX = e.clientX - bubbleRect.left;
  pointerOffsetY = e.clientY - bubbleRect.top;

  bubbleIcon.setPointerCapture?.(e.pointerId);

  function onPointerMove(moveEvent) {
    if (moveEvent.pointerId !== activePointerId) return;

    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;

    if (Math.hypot(deltaX, deltaY) > 4) {
      isDragging = true;
    }

    if (isDragging) {
      let newLeft = moveEvent.clientX - pointerOffsetX - containerRect.left;
      let newTop = moveEvent.clientY - pointerOffsetY - containerRect.top;

      const maxLeft = containerRect.width - floatingBubble.offsetWidth;
      const maxTop = containerRect.height - floatingBubble.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      floatingBubble.style.left = `${newLeft}px`;
      floatingBubble.style.top = `${newTop}px`;
      floatingBubble.style.right = 'auto';
    }
  }

  function onPointerUp(upEvent) {
    if (upEvent.pointerId !== activePointerId) return;

    bubbleIcon.releasePointerCapture?.(upEvent.pointerId);
    bubbleIcon.removeEventListener('pointermove', onPointerMove);
    bubbleIcon.removeEventListener('pointerup', onPointerUp);
    bubbleIcon.removeEventListener('pointercancel', onPointerUp);
    activePointerId = null;

    if (!isDragging) {
      bubbleMenu.classList.toggle('hidden');
      addForm.classList.add('hidden');
      btnAddNew.classList.remove('hidden');
      renderGamesList();
    }
  }

  bubbleIcon.addEventListener('pointermove', onPointerMove);
  bubbleIcon.addEventListener('pointerup', onPointerUp);
  bubbleIcon.addEventListener('pointercancel', onPointerUp);
});