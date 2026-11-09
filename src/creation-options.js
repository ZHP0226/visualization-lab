// Choices are readable draft text. No hidden state survives a draft/project switch.
export function setupCreationOptions(input) {
  const root = document.getElementById('creation-options');
  const error = document.getElementById('creation-options-error');
  let categories = [];
  const close = () => root.querySelectorAll('details[open]').forEach(d => { d.open = false; });
  function current(category) {
    const lines = input.value.split(/\r?\n/).map(line => line.trim());
    const line = lines.findLast(line => category.options.some(o => line === `${category.label}：${o.label}`));
    return category.options.find(o => line === `${category.label}：${o.label}`)?.id || '';
  }
  function refresh() {
    for (const category of categories) {
      const selected = current(category), item = category.options.find(o => o.id === selected);
      document.getElementById(`creation-${category.id}-value`).textContent = item?.label || '默认';
      const details = document.getElementById(`creation-${category.id}`);
      details.classList.toggle('has-choice', !!selected);
      details.querySelectorAll('[data-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.choice === selected)));
    }
  }
  function choose(category, option) {
    if (input.disabled) return;
    const known = new Set(category.options.map(o => `${category.label}：${o.label}`));
    const body = input.value.split(/\r?\n/).filter(line => !known.has(line.trim())).join('\n').trimEnd();
    const text = option ? [body, `${category.label}：${option.label}`].filter(Boolean).join('\n') : body;
    if (text.length > input.maxLength) { error.textContent = '输入内容已满，请删减文字后再选择。'; return; }
    input.value = text; error.textContent = ''; close(); refresh();
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); input.setSelectionRange(text.length, text.length);
  }
  function card(category, option) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'creation-card'; button.dataset.choice = option?.id || ''; button.setAttribute('aria-pressed', 'false');
    if (option?.preview) { const image = document.createElement('img'); image.src = option.preview; image.alt = `${option.label} · ${category.label}效果示意`; image.loading = 'lazy'; button.append(image); }
    const label = document.createElement('strong'); label.textContent = option?.label || '默认';
    const description = document.createElement('span'); description.textContent = option?.description || (category.id === 'software' ? '未确认时，制作前询问' : '按需求理解');
    button.append(label, description); button.addEventListener('click', () => choose(category, option)); return button;
  }
  window.workbench.creationOptions().then(data => {
    categories = data;
    for (const category of categories) {
      const details = document.createElement('details'); details.id = `creation-${category.id}`; details.className = 'creation-picker';
      const summary = document.createElement('summary'); summary.setAttribute('aria-label', `选择${category.label}`); summary.setAttribute('aria-controls', `creation-${category.id}-panel`);
      const name = document.createElement('span'); name.textContent = category.label;
      const value = document.createElement('span'); value.id = `creation-${category.id}-value`; value.className = 'creation-value'; value.textContent = '默认';
      const arrow = document.createElement('span'); arrow.className = 'disclosure-triangle up'; arrow.setAttribute('aria-hidden', 'true'); summary.append(name, value, arrow);
      const panel = document.createElement('div'); panel.id = `creation-${category.id}-panel`; panel.className = 'creation-popover'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', `选择${category.label}`);
      const heading = document.createElement('div'); heading.className = 'creation-popover-heading';
      const title = document.createElement('strong'); title.textContent = `选择${category.label}`;
      const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'creation-dismiss'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', `收起${category.label}选项`); dismiss.addEventListener('click', () => { details.open = false; summary.focus(); }); heading.append(title, dismiss);
      const description = document.createElement('p'); description.textContent = category.id === 'material' ? 'Blender 示意 · 支持 Blender / C4D' : category.description;
      const reset = card(category, null); reset.classList.add('creation-default');
      const grid = document.createElement('div'); grid.className = `creation-grid ${category.id === 'material' ? 'material-grid' : category.id === 'lighting' ? 'lighting-grid' : ''}`;
      for (const option of category.options) grid.append(card(category, option));
      panel.append(heading, description, reset, grid); details.append(summary, panel); root.append(details);
      summary.addEventListener('click', () => { if (!details.open) root.querySelectorAll('details[open]').forEach(d => { if (d !== details) d.open = false; }); });
      details.addEventListener('toggle', () => { summary.setAttribute('aria-expanded', String(details.open)); if (details.open) panel.scrollTop = 0; });
    }
    root.dataset.ready = 'true'; refresh();
  }).catch(() => { error.textContent = '创作选项暂时未能加载，可直接在输入框说明要求。'; });
  input.addEventListener('input', () => { error.textContent = ''; refresh(); });
  document.addEventListener('click', event => { if (!root.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && root.querySelector('details[open]')) { event.preventDefault(); event.stopImmediatePropagation(); const summary = root.querySelector('details[open] > summary'); close(); summary.focus(); } });
  return { refresh, close };
}
