(function () {
  const STORAGE_PREFIX = "words-from-word:";
  const WORD_ROUTE_PARAM = "word";
  const fallbackGameData = {
    dictionaryName: "Демонстрационный список",
    generatedAt: "2026-05-10",
    bigWords: [
      {
        word: "местонахождение",
        answers: [
          { word: "ад", definition: "Демонстрационное определение: место или состояние мучения.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B0%D0%B4" },
          { word: "дно", definition: "Демонстрационное определение: нижняя часть сосуда, водоема или углубления.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B4%D0%BD%D0%BE" },
          { word: "дом", definition: "Демонстрационное определение: жилое здание или место проживания.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B4%D0%BE%D0%BC" },
          { word: "еда", definition: "Демонстрационное определение: пища, то, что едят.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B5%D0%B4%D0%B0" },
          { word: "место", definition: "Демонстрационное определение: пространство, участок или положение, занимаемое кем-либо или чем-либо.", sourceUrl: "https://gramota.ru/poisk?query=%D0%BC%D0%B5%D1%81%D1%82%D0%BE" },
        ],
      },
      {
        word: "доказательство",
        answers: [
          { word: "весло", definition: "Демонстрационное определение: шест с лопастью для гребли.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B2%D0%B5%D1%81%D0%BB%D0%BE" },
          { word: "дело", definition: "Демонстрационное определение: занятие, работа, событие или судебное производство.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B4%D0%B5%D0%BB%D0%BE" },
          { word: "доза", definition: "Демонстрационное определение: определенное количество вещества или воздействия.", sourceUrl: "https://gramota.ru/poisk?query=%D0%B4%D0%BE%D0%B7%D0%B0" },
          { word: "стадо", definition: "Демонстрационное определение: группа пасущихся животных одного вида.", sourceUrl: "https://gramota.ru/poisk?query=%D1%81%D1%82%D0%B0%D0%B4%D0%BE" },
        ],
      },
    ],
  };
  const gameData = window.GAME_DATA?.bigWords?.length ? window.GAME_DATA : fallbackGameData;

  const state = {
    currentPuzzle: null,
    guessed: new Set(),
    hintsUsed: 0,
    hintedWords: new Set(),
    currentHintedWord: null,
    statusTimer: null,
  };

  const elements = {
    menuScreen: document.getElementById("menu-screen"),
    gameScreen: document.getElementById("game-screen"),
    wordMenu: document.getElementById("word-menu"),
    backToMenu: document.getElementById("back-to-menu"),
    gameTitle: document.getElementById("game-title"),
    progressText: document.getElementById("progress-text"),
    guessForm: document.getElementById("guess-form"),
    guessInput: document.getElementById("guess-input"),
    statusMessage: document.getElementById("status-message"),
    hintButton: document.getElementById("hint-button"),
    resetButton: document.getElementById("reset-button"),
    hintBox: document.getElementById("hint-box"),
    winMessage: document.getElementById("win-message"),
    answerCount: document.getElementById("answer-count"),
    answerList: document.getElementById("answer-list"),
    definitionDialog: document.getElementById("definition-dialog"),
    closeDefinition: document.getElementById("close-definition"),
    definitionWord: document.getElementById("definition-word"),
    definitionText: document.getElementById("definition-text"),
    definitionSource: document.getElementById("definition-source"),
  };

  function normalizeWord(word) {
    return word
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^а-я]/g, "");
  }

  function hyphenateRussianWord(word) {
    const manualBreaks = {
      "местонахождение": "ме\u00adсто\u00adна\u00adхо\u00adжде\u00adние",
      "кинематографист": "ки\u00adне\u00adма\u00adто\u00adгра\u00adфист",
      "священнослужитель": "свя\u00adщен\u00adно\u00adслу\u00adжи\u00adтель",
      "фальшивомонетчик": "фаль\u00adши\u00adво\u00adмо\u00adнет\u00adчик",
      "доказательство": "до\u00adка\u00adза\u00adтель\u00adство",
      "жаворонок": "жа\u00adво\u00adро\u00adнок",
      "красавица": "кра\u00adса\u00adви\u00adца",
      "башибузук": "ба\u00adши\u00adбу\u00adзук",
    };

    return manualBreaks[normalizeWord(word)] || word;
  }

  function storageKey(puzzleWord) {
    return `${STORAGE_PREFIX}${normalizeWord(puzzleWord)}`;
  }

  function loadProgress(puzzleWord) {
    try {
      const raw = localStorage.getItem(storageKey(puzzleWord));
      if (!raw) {
        return { guessed: [], hintsUsed: 0, hintedWords: [] };
      }

      const progress = JSON.parse(raw);
      return {
        guessed: Array.isArray(progress.guessed) ? progress.guessed : [],
        hintsUsed: Number.isInteger(progress.hintsUsed) ? progress.hintsUsed : 0,
        hintedWords: Array.isArray(progress.hintedWords) ? progress.hintedWords : [],
      };
    } catch {
      return { guessed: [], hintsUsed: 0, hintedWords: [] };
    }
  }

  function saveProgress() {
    if (!state.currentPuzzle) {
      return;
    }

    localStorage.setItem(
      storageKey(state.currentPuzzle.word),
      JSON.stringify({
        guessed: [...state.guessed],
        hintsUsed: state.hintsUsed,
        hintedWords: [...state.hintedWords],
      })
    );
  }

  function canBuildFromLetters(guess, sourceWord) {
    const available = countLetters(normalizeWord(sourceWord));
    const needed = countLetters(normalizeWord(guess));

    for (const [letter, count] of needed.entries()) {
      if ((available.get(letter) || 0) < count) {
        return false;
      }
    }

    return true;
  }

  function countLetters(word) {
    const counts = new Map();
    for (const letter of word) {
      counts.set(letter, (counts.get(letter) || 0) + 1);
    }
    return counts;
  }

  function getAnswerByNormalizedWord(word) {
    const normalized = normalizeWord(word);
    return state.currentPuzzle.answers.find((answer) => answer.normalized === normalized);
  }

  function sortedAnswers(puzzle) {
    return [...puzzle.answers].sort((a, b) => a.word.localeCompare(b.word, "ru"));
  }

  function findPuzzle(puzzleWord) {
    const normalized = normalizeWord(puzzleWord || "");
    return gameData.bigWords.find((item) => normalizeWord(item.word) === normalized);
  }

  function routeUrlForPuzzle(puzzleWord) {
    const url = new URL(window.location.href);
    url.searchParams.set(WORD_ROUTE_PARAM, puzzleWord);
    return `${url.pathname}${url.search}`;
  }

  function menuRouteUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete(WORD_ROUTE_PARAM);
    return `${url.pathname}${url.search}`;
  }

  function navigateToPuzzle(puzzleWord) {
    const puzzle = findPuzzle(puzzleWord);
    if (!puzzle) {
      return;
    }

    history.pushState({ screen: "game", word: puzzle.word, fromMenu: true }, "", routeUrlForPuzzle(puzzle.word));
    startPuzzle(puzzle.word);
  }

  function navigateToMenu() {
    if (history.state?.screen === "game" && history.state.fromMenu) {
      history.back();
      return;
    }

    history.replaceState({ screen: "menu" }, "", menuRouteUrl());
    showMenu();
  }

  function renderRoute(isInitialLoad = false) {
    const routedWord = new URLSearchParams(window.location.search).get(WORD_ROUTE_PARAM);
    const puzzle = findPuzzle(routedWord);

    if (routedWord && puzzle) {
      if (isInitialLoad && !history.state) {
        history.replaceState({ screen: "menu" }, "", menuRouteUrl());
        history.pushState({ screen: "game", word: puzzle.word, fromMenu: true }, "", routeUrlForPuzzle(puzzle.word));
      } else {
        history.replaceState({ screen: "game", word: puzzle.word, fromMenu: false }, "", routeUrlForPuzzle(puzzle.word));
      }
      startPuzzle(puzzle.word);
      return;
    }

    if (routedWord) {
      history.replaceState({ screen: "menu" }, "", menuRouteUrl());
    } else if (!history.state) {
      history.replaceState({ screen: "menu" }, "", menuRouteUrl());
    }
    showMenu();
  }

  function renderMenu() {
    elements.wordMenu.innerHTML = "";

    [...gameData.bigWords]
      .sort((a, b) => a.answers.length - b.answers.length || a.word.localeCompare(b.word, "ru"))
      .forEach((puzzle) => {
        const savedProgress = loadProgress(puzzle.word);
        const found = savedProgress.guessed.filter((word) =>
          puzzle.answers.some((answer) => normalizeWord(answer.word) === normalizeWord(word))
        ).length;
        const total = puzzle.answers.length;
        const button = document.createElement("button");
        const word = document.createElement("strong");
        const progressText = document.createElement("span");
        button.className = "word-card";
        button.type = "button";
        word.textContent = hyphenateRussianWord(puzzle.word);
        progressText.textContent = `${found} из ${total} найдено`;
        button.append(word, progressText);
        button.addEventListener("click", () => navigateToPuzzle(puzzle.word));
        elements.wordMenu.append(button);
      });
  }

  function startPuzzle(puzzleWord) {
    const puzzle = findPuzzle(puzzleWord);
    if (!puzzle) {
      return;
    }

    const preparedAnswers = sortedAnswers(puzzle).map((answer) => ({
      ...answer,
      normalized: normalizeWord(answer.word),
    }));

    const progress = loadProgress(puzzle.word);
    const validAnswers = new Set(preparedAnswers.map((answer) => answer.normalized));
    state.currentPuzzle = { ...puzzle, answers: preparedAnswers };
    state.guessed = new Set(progress.guessed.map(normalizeWord).filter((word) => validAnswers.has(word)));
    state.hintsUsed = progress.hintsUsed;
    state.hintedWords = new Set(progress.hintedWords.map(normalizeWord).filter((word) => validAnswers.has(word)));
    state.currentHintedWord = null;

    elements.menuScreen.classList.remove("active");
    elements.gameScreen.classList.add("active");
    elements.gameScreen.classList.remove("won");
    elements.backToMenu.classList.remove("hidden");
    elements.resetButton.classList.remove("hidden");
    elements.gameTitle.textContent = puzzle.word;
    elements.guessInput.value = "";
    elements.hintBox.classList.add("hidden");
    setStatus("Введите слово и нажмите Enter.");
    renderGame();
    elements.guessInput.focus();
  }

  function showMenu() {
    state.currentPuzzle = null;
    state.guessed = new Set();
    state.hintsUsed = 0;
    state.hintedWords = new Set();
    state.currentHintedWord = null;
    elements.gameScreen.classList.remove("active");
    elements.gameScreen.classList.remove("won");
    elements.menuScreen.classList.add("active");
    elements.backToMenu.classList.add("hidden");
    elements.resetButton.classList.add("hidden");
    renderMenu();
  }

  function renderGame() {
    if (!state.currentPuzzle) {
      return;
    }

    const found = state.guessed.size;
    const total = state.currentPuzzle.answers.length;
    elements.progressText.textContent = `Найдено ${found} из ${total}. Подсказок использовано: ${state.hintsUsed}.`;
    elements.answerCount.textContent = `${found}/${total}`;
    renderAnswers();
    paintSharedAnswerGradient();
    renderWinMessage();
    saveProgress();
  }

  function renderAnswers() {
    elements.answerList.innerHTML = "";
    state.currentPuzzle.answers.forEach((answer) => {
      const isGuessed = state.guessed.has(answer.normalized);
      const slot = document.createElement("button");
      slot.className = `answer-slot${isGuessed ? " revealed" : ""}`;
      slot.type = "button";
      slot.textContent = isGuessed ? answer.word : blankForWord(answer.word);
      slot.style.setProperty("--word-length", normalizeWord(answer.word).length);
      slot.disabled = !isGuessed;
      slot.addEventListener("click", () => showDefinition(answer));
      elements.answerList.append(slot);
    });
  }

  function paintSharedAnswerGradient() {
    const listRect = elements.answerList.getBoundingClientRect();
    const revealedSlots = elements.answerList.querySelectorAll(".answer-slot.revealed");

    revealedSlots.forEach((slot) => {
      const slotRect = slot.getBoundingClientRect();
      slot.style.setProperty("--shared-gradient-width", `${listRect.width}px`);
      slot.style.setProperty("--shared-gradient-height", `${Math.max(listRect.height, slotRect.height)}px`);
      slot.style.setProperty("--shared-gradient-x", `${listRect.left - slotRect.left}px`);
      slot.style.setProperty("--shared-gradient-y", `${listRect.top - slotRect.top}px`);
    });
  }

  function blankForWord(word) {
    return "";
  }

  function renderWinMessage() {
    if (!state.currentPuzzle || state.guessed.size !== state.currentPuzzle.answers.length) {
      elements.winMessage.classList.add("hidden");
      elements.gameScreen.classList.remove("won");
      return;
    }

    elements.winMessage.classList.remove("hidden");
    elements.gameScreen.classList.add("won");
    clearStatus();
    elements.winMessage.textContent = `Блестяще! Вы раскрыли весь список до последнего слова. Подсказок использовано: ${state.hintsUsed}.`;
  }

  function submitGuess(event) {
    event.preventDefault();

    if (!state.currentPuzzle) {
      return;
    }

    const guess = normalizeWord(elements.guessInput.value);
    if (!guess) {
      setStatus("Введите слово.", "bad");
      return;
    }

    if (guess === normalizeWord(state.currentPuzzle.word)) {
      setStatus("Само большое слово не засчитывается.", "bad");
      return;
    }

    if (state.guessed.has(guess)) {
      setStatus("Такое слово уже найдено.", "bad");
      elements.guessInput.value = "";
      return;
    }

    if (!canBuildFromLetters(guess, state.currentPuzzle.word)) {
      setStatus("Это слово нельзя составить из букв большого слова.", "bad");
      return;
    }

    const answer = getAnswerByNormalizedWord(guess);
    if (!answer) {
      setStatus("Такого слова нет в списке ответов.", "bad");
      return;
    }

    state.guessed.add(answer.normalized);
    elements.guessInput.value = "";
    const isComplete = state.guessed.size === state.currentPuzzle.answers.length;
    if (state.currentHintedWord === answer.normalized) {
      state.currentHintedWord = null;
      elements.hintBox.classList.add("hidden");
      elements.hintBox.textContent = "";
      if (!isComplete) {
        setStatus(`Верно! «${answer.word}» было словом из подсказки.`, "good celebrate", true);
      }
    } else {
      if (!isComplete) {
        setStatus(randomCorrectMessage(answer.word), "good celebrate", true);
      }
    }
    if (isComplete) {
      clearStatus();
    }
    renderGame();
  }

  function randomCorrectMessage(word) {
    const messages = [
      `Отличный удар! «${word}» открыто.`,
      `Есть попадание! «${word}» добавлено в список.`,
      `Красиво! Слово «${word}» найдено.`,
      `Точно в цель! «${word}» засчитано.`,
      `Сильная находка! «${word}» теперь ваше.`,
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  function showHint() {
    if (!state.currentPuzzle) {
      return;
    }

    const available = state.currentPuzzle.answers.filter((answer) => !state.guessed.has(answer.normalized));
    if (available.length === 0) {
      setStatus("Все слова уже найдены.", "good");
      return;
    }

    const notHinted = available.filter((answer) => !state.hintedWords.has(answer.normalized));
    const pool = notHinted.length > 0 ? notHinted : available;
    const answer = pool[Math.floor(Math.random() * pool.length)];
    state.hintsUsed += 1;
    state.hintedWords.add(answer.normalized);
    state.currentHintedWord = answer.normalized;
    elements.hintBox.classList.remove("hidden");
    elements.hintBox.textContent = "";
    const firstLetter = document.createElement("strong");
    firstLetter.textContent = `Первая буква: ${answer.word[0].toLocaleUpperCase("ru-RU")}`;
    const definition = document.createElement("p");
    definition.textContent = answer.definition;
    elements.hintBox.append(firstLetter, definition);
    renderGame();
  }

  function resetProgress() {
    if (!state.currentPuzzle) {
      return;
    }

    const shouldReset = window.confirm(`Сбросить прогресс для слова «${state.currentPuzzle.word}»?`);
    if (!shouldReset) {
      return;
    }

    localStorage.removeItem(storageKey(state.currentPuzzle.word));
    state.guessed = new Set();
    state.hintsUsed = 0;
    state.hintedWords = new Set();
    state.currentHintedWord = null;
    elements.hintBox.classList.add("hidden");
    elements.hintBox.textContent = "";
    setStatus("Прогресс сброшен.");
    renderGame();
  }

  function showDefinition(answer) {
    elements.definitionWord.textContent = answer.word;
    elements.definitionText.textContent = answer.definition || "Определение пока не добавлено.";

    if (answer.sourceUrl) {
      elements.definitionSource.href = answer.sourceUrl;
      elements.definitionSource.classList.remove("hidden");
    } else {
      elements.definitionSource.classList.add("hidden");
    }

    if (typeof elements.definitionDialog.showModal === "function") {
      elements.definitionDialog.showModal();
    } else {
      elements.definitionDialog.setAttribute("open", "");
    }
  }

  function setStatus(message, type, autoHide = false) {
    clearTimeout(state.statusTimer);
    elements.statusMessage.textContent = message;
    elements.statusMessage.classList.remove("good", "bad", "celebrate", "hidden");
    if (type) {
      elements.statusMessage.classList.add(...type.split(" "));
    }
    if (autoHide) {
      state.statusTimer = setTimeout(clearStatus, 5000);
    }
  }

  function clearStatus() {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
    elements.statusMessage.textContent = "";
    elements.statusMessage.classList.remove("good", "bad", "celebrate");
    elements.statusMessage.classList.add("hidden");
  }

  function closeDefinition() {
    if (typeof elements.definitionDialog.close === "function") {
      elements.definitionDialog.close();
    } else {
      elements.definitionDialog.removeAttribute("open");
    }
  }

  elements.guessForm.addEventListener("submit", submitGuess);
  elements.hintButton.addEventListener("click", showHint);
  elements.resetButton.addEventListener("click", resetProgress);
  elements.backToMenu.addEventListener("click", navigateToMenu);
  elements.closeDefinition.addEventListener("click", closeDefinition);
  elements.definitionDialog.addEventListener("click", (event) => {
    if (event.target === elements.definitionDialog) {
      closeDefinition();
    }
  });
  window.addEventListener("popstate", () => renderRoute());
  window.addEventListener("resize", paintSharedAnswerGradient);

  renderRoute(true);
})();
