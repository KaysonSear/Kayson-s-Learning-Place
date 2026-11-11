(function (global) {
  'use strict';
  const OPTION_VERSION = 2;

  function makeOrder(ids, mode, random = Math.random) {
    const order = [...ids].sort((a, b) => a - b);
    if (mode === 'random') {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    return order;
  }

  function start(ids, mode = 'sequence') {
    const order = makeOrder(ids, mode);
    return { mode, order, current: order[0], answers: {}, finished: false, optionVersion: OPTION_VERSION };
  }

  function changeMode(round, mode) {
    if (mode === round.mode) return;
    round.order = makeOrder(round.order, mode);
    round.mode = mode;
  }

  function answer(round, question, choice) {
    if (round.finished || round.current !== question.id || Object.hasOwn(round.answers, question.id) ||
        !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return false;
    round.answers[question.id] = choice;
    return true;
  }

  function jump(round, id) {
    if (!round.order.includes(id)) return false;
    round.current = id;
    round.finished = false;
    return true;
  }

  function next(round) {
    const position = round.order.indexOf(round.current);
    for (let offset = 1; offset <= round.order.length; offset++) {
      const id = round.order[(position + offset) % round.order.length];
      if (!Object.hasOwn(round.answers, id)) {
        round.current = id;
        return;
      }
    }
    round.finished = true;
  }

  function restore(value, bank) {
    if (value == null) return null;
    const version = value.optionVersion === undefined ? 1 : value.optionVersion;
    if (version !== 1 && version !== OPTION_VERSION) throw Error('刷题选项版本不受支持。');
    const ids = [...bank.keys()];
    if (!['sequence', 'random'].includes(value.mode) || !Array.isArray(value.order) ||
        value.order.length !== ids.length || new Set(value.order).size !== ids.length ||
        value.order.some(id => !bank.has(id)) || !bank.has(value.current) ||
        !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) ||
        typeof value.finished !== 'boolean') throw Error('刷题进度格式无效。');
    if (value.mode === 'sequence' && value.order.some((id, i) => i > 0 && id <= value.order[i - 1])) {
      throw Error('刷题顺序无效。');
    }
    const answers = {};
    for (const [key, choice] of Object.entries(value.answers)) {
      const question = bank.get(Number(key));
      const restoredChoice = version === 1 ? question?.legacyOptionMap?.[choice] : choice;
      if (!question || String(question.id) !== key || !Number.isInteger(choice) || choice < 0 ||
          !Number.isInteger(restoredChoice) || restoredChoice < 0 || restoredChoice >= question.options.length) {
        throw Error('刷题答案格式无效。');
      }
      answers[key] = restoredChoice;
    }
    if (value.finished && Object.keys(answers).length !== ids.length) throw Error('刷题完成记录无效。');
    return { mode: value.mode, order: [...value.order], current: value.current, answers, finished: value.finished, optionVersion: OPTION_VERSION };
  }

  function render(container, state, bank, save, escape, explanationMarkup) {
    if (!state.drill) {
      state.drill = start(bank.keys());
      save();
    }
    const round = state.drill;
    const total = bank.size;
    const answered = Object.keys(round.answers).length;
    const correct = Object.entries(round.answers).filter(([id, choice]) => bank.get(Number(id)).answer === choice).length;
    const question = bank.get(round.current);
    const selected = round.answers[question.id];
    const graded = selected !== undefined;
    const passed = selected === question.answer;
    const position = round.order.indexOf(question.id) + 1;

    container.innerHTML = `
      <section class="drill" aria-labelledby="drill-title">
        <div class="section-head"><h1 id="drill-title">刷题</h1><a class="text-button" href="#home">退出，稍后继续</a></div>
        <p class="drill-stats">已答 ${answered} / ${total} · 答对 ${correct} · 正确率 ${answered ? `${Math.round(100 * correct / answered)}%` : '—'}</p>
        <progress class="drill-progress" value="${answered}" max="${total}" aria-label="刷题进度"></progress>
        <div class="drill-controls">
          <label>题序 <select id="drill-mode"><option value="sequence">顺序</option><option value="random" ${round.mode === 'random' ? 'selected' : ''}>随机</option></select></label>
          <form id="drill-jump" novalidate><label for="drill-number">跳到原题号</label><input id="drill-number" type="text" inputmode="numeric" maxlength="8" placeholder="1–${total}" aria-describedby="drill-error"><button class="button secondary" type="submit">跳转</button></form>
          <button class="text-button" type="button" id="drill-restart">${answered === total ? '再刷一轮' : '重新开始'}</button>
        </div>
        <p id="drill-error" role="alert"></p>
        ${round.finished ? '<section class="feedback" tabindex="-1" id="drill-feedback"><h2>本轮全部答完</h2><p>输入原题号可回看本轮答案。</p></section>' : `
          <p class="eyebrow">第 ${question.id} 题${round.mode === 'random' ? ` · 随机位置 ${position} / ${total}` : ''}</p>
          <h2 class="drill-prompt" id="drill-prompt" tabindex="-1">${escape(question.prompt)}</h2>
          <div class="choice-list" role="group" aria-labelledby="drill-prompt">
            ${question.options.map((option, index) => `<button type="button" class="choice ${graded && index === question.answer ? 'correct' : ''} ${graded && index === selected && !passed ? 'wrong' : ''}" data-drill-choice="${index}" ${graded ? 'disabled' : ''}><span class="choice-key">${String.fromCharCode(65 + index)}</span><span>${escape(option)}${graded && index === question.answer ? ' ✓' : ''}${graded && index === selected ? '（你的答案）' : ''}</span></button>`).join('')}
          </div>
          ${graded ? `<section class="feedback ${passed ? '' : 'wrong'}" id="drill-feedback" tabindex="-1">
            <h2>${passed ? '回答正确' : '回答错误'}</h2><p>正确答案 ${escape(question.options[question.answer])}</p>
            ${explanationMarkup(question)}<div class="button-row"><a class="text-button" href="#point-${question.id}">查看原文</a><button class="button primary" id="drill-next" type="button">${answered === total ? '查看本轮结果' : '下一题'}</button></div>
          </section>` : ''}`}
      </section>`;

    function refresh(focusId) {
      save();
      render(container, state, bank, save, escape, explanationMarkup);
      container.querySelector(focusId)?.focus();
    }
    container.querySelector('#drill-mode').addEventListener('change', event => {
      changeMode(round, event.target.value);
      refresh('#drill-mode');
    });
    container.querySelector('#drill-jump').addEventListener('submit', event => {
      event.preventDefault();
      const input = container.querySelector('#drill-number');
      const text = input.value.trim();
      if (!/^\d+$/.test(text) || !jump(round, Number(text))) {
        container.querySelector('#drill-error').textContent = `请输入 1 到 ${total} 的整数题号。`;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      refresh('#drill-prompt');
    });
    container.querySelector('#drill-restart').addEventListener('click', () => {
      if (answered > 0 && answered < total && !global.confirm('重新开始会清除本轮刷题答案。确定重新开始？')) return;
      state.drill = start(bank.keys(), round.mode);
      refresh('#drill-prompt');
    });
    for (const choice of container.querySelectorAll('[data-drill-choice]')) {
      choice.addEventListener('click', () => {
        if (answer(round, question, Number(choice.dataset.drillChoice))) refresh('#drill-feedback');
      });
    }
    function advance() {
      next(round);
      refresh(round.finished ? '#drill-feedback' : '#drill-prompt');
    }
    container.querySelector('#drill-next')?.addEventListener('click', advance);
    container.querySelector('#drill-feedback')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.repeat && event.target === event.currentTarget && graded && !round.finished) {
        event.preventDefault();
        advance();
      }
    });
  }

  global.CLabDrill = { makeOrder, start, changeMode, answer, jump, next, restore, render };
})(typeof window === 'undefined' ? globalThis : window);
