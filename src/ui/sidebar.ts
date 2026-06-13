// ============================================================
// Sidebar — Character Configuration UI
// ============================================================

import type { CharacterConfig, AttackConfig, RiderConfig, RiderCondition, RiderPlacement } from '../types.js';

export type ConfigChangeCallback = (config: CharacterConfig) => void;

let _config: CharacterConfig;
let _onChange: ConfigChangeCallback;

export function initSidebar(config: CharacterConfig, onChange: ConfigChangeCallback): void {
  _config = config;
  _onChange = onChange;
  renderFromConfig();
  bindStaticListeners();
}

export function updateSidebarConfig(config: CharacterConfig): void {
  _config = config;
  renderFromConfig();
}

function emit(): void {
  _onChange(_config);
  // Save to localStorage
  localStorage.setItem('dnd-dpr-config', JSON.stringify(_config));
}

function renderFromConfig(): void {
  setVal('cfg-name', _config.name);
  setVal('cfg-level', _config.level);
  setVal('cfg-prof', _config.proficiencyBonus);
  setVal('cfg-abilmod', _config.abilityMod);
  setVal('cfg-fstyle', _config.fightingStyle.bonus);
  setVal('cfg-critrange', _config.critRange);

  // Feats
  setChecked('cfg-sharpshooter', _config.feats.sharpshooter || _config.feats.gwm);
  setChecked('cfg-halflinglucky', _config.feats.halflingLucky);
  setChecked('cfg-lucky', _config.feats.lucky.enabled);
  setVal('cfg-luckypoints', _config.feats.lucky.points);
  setChecked('cfg-piercer', _config.feats.piercer.enabled);
  setVal('cfg-piercerdie', _config.feats.piercer.die);
  setChecked('cfg-xbowexpert', _config.feats.crossbowExpert);
  setChecked('cfg-vex', _config.weaponMastery.vex);

  // Advantage
  setChecked('cfg-surprise', _config.advantageSources.surprise);
  setChecked('cfg-flanking', _config.advantageSources.flanking);
  setChecked('cfg-luckyatk1', _config.advantageSources.luckyOnAtk1);

  // Show/hide sub-fields
  toggleSubFields();

  // Attacks list
  renderAttacksList();

  // Action Surge section
  renderActionSurgeSection();

  // Riders list
  renderRidersList();
}

function toggleSubFields(): void {
  const luckyEnabled = _config.feats.lucky.enabled;
  const piercerEnabled = _config.feats.piercer.enabled;

  document.querySelectorAll('.cfg-lucky-sub').forEach(el => {
    (el as HTMLElement).style.display = luckyEnabled ? '' : 'none';
  });
  document.querySelectorAll('.cfg-piercer-sub').forEach(el => {
    (el as HTMLElement).style.display = piercerEnabled ? '' : 'none';
  });
}

function renderAttacksList(): void {
  const container = document.getElementById('attacks-list')!;
  container.innerHTML = '';

  _config.attacks.forEach((atk, idx) => {
    const div = document.createElement('div');
    div.className = 'attack-card';
    div.innerHTML = `
      <div class="attack-header">
        <span class="attack-num">Attack ${idx + 1}</span>
        <button class="btn-icon btn-remove-attack" data-idx="${idx}" title="Remove">✕</button>
      </div>
      <div class="field-row">
        <label>Name</label>
        <input type="text" class="input-text atk-name" data-idx="${idx}" value="${escapeHtml(atk.name)}" />
      </div>
      <div class="field-row">
        <label>Damage Dice</label>
        <select class="input-select atk-dice" data-idx="${idx}">
          ${['1d4','1d6','1d8','1d10','1d12','2d6'].map(d =>
            `<option value="${d}" ${d === atk.weapon.damageDice ? 'selected' : ''}>${d}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>Magic Bonus</label>
        <select class="input-select atk-magic" data-idx="${idx}">
          ${[0,1,2,3].map(b =>
            `<option value="${b}" ${b === atk.weapon.magicBonus ? 'selected' : ''}>+${b}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>Uses Ability Mod</label>
        <input type="checkbox" class="atk-abilmod" data-idx="${idx}" ${atk.useAbilityMod ? 'checked' : ''} />
      </div>
      <div class="field-row">
        <label>Special Weapon (Pact/etc)</label>
        <input type="checkbox" class="atk-pact" data-idx="${idx}" ${atk.isPactWeapon ? 'checked' : ''} />
      </div>
    `;
    container.appendChild(div);
  });

  // Bind attack inputs
  container.querySelectorAll('.atk-name').forEach(el => {
    el.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks[idx].name = (e.target as HTMLInputElement).value;
      emit();
    });
  });
  container.querySelectorAll('.atk-dice').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks[idx].weapon.damageDice = (e.target as HTMLSelectElement).value;
      emit();
    });
  });
  container.querySelectorAll('.atk-magic').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks[idx].weapon.magicBonus = parseInt((e.target as HTMLSelectElement).value);
      emit();
    });
  });
  container.querySelectorAll('.atk-abilmod').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks[idx].useAbilityMod = (e.target as HTMLInputElement).checked;
      emit();
    });
  });
  container.querySelectorAll('.atk-pact').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks[idx].isPactWeapon = (e.target as HTMLInputElement).checked;
      emit();
    });
  });
  container.querySelectorAll('.btn-remove-attack').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.attacks.splice(idx, 1);
      _config.attacks.forEach((a, i) => { a.order = i + 1; });
      renderAttacksList();
      emit();
    });
  });
}

function renderActionSurgeSection(): void {
  // Ensure config has actionSurge field (backwards compat)
  if (!_config.actionSurge) {
    _config.actionSurge = {
      enabled: false,
      extraAttacks: [],
      usesPerRest: 1,
    };
  }

  const as = _config.actionSurge;

  // Update the enable checkbox
  setChecked('cfg-actionsurge', as.enabled);

  // Show/hide sub-section
  const subEl = document.getElementById('actionsurge-sub');
  if (subEl) subEl.style.display = as.enabled ? '' : 'none';

  // Update uses count
  setVal('cfg-actionsurge-uses', as.usesPerRest);

  // Render surge attacks list
  const container = document.getElementById('surge-attacks-list');
  if (!container) return;
  container.innerHTML = '';

  as.extraAttacks.forEach((atk, idx) => {
    const div = document.createElement('div');
    div.className = 'attack-card';
    div.innerHTML = `
      <div class="attack-header">
        <span class="attack-num">Surge Attack ${idx + 1}</span>
        <button class="btn-icon btn-remove-surge" data-idx="${idx}" title="Remove">✕</button>
      </div>
      <div class="field-row">
        <label>Name</label>
        <input type="text" class="input-text surge-name" data-idx="${idx}" value="${escapeHtml(atk.name)}" />
      </div>
      <div class="field-row">
        <label>Damage Dice</label>
        <select class="input-select surge-dice" data-idx="${idx}">
          ${['1d4','1d6','1d8','1d10','1d12','2d6'].map(d =>
            `<option value="${d}" ${d === atk.weapon.damageDice ? 'selected' : ''}>${d}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>Magic Bonus</label>
        <select class="input-select surge-magic" data-idx="${idx}">
          ${[0,1,2,3].map(b =>
            `<option value="${b}" ${b === atk.weapon.magicBonus ? 'selected' : ''}>+${b}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-row">
        <label>Uses Ability Mod</label>
        <input type="checkbox" class="surge-abilmod" data-idx="${idx}" ${atk.useAbilityMod ? 'checked' : ''} />
      </div>
      <div class="field-row">
        <label>Special Weapon (Pact/etc)</label>
        <input type="checkbox" class="surge-pact" data-idx="${idx}" ${atk.isPactWeapon ? 'checked' : ''} />
      </div>
    `;
    container.appendChild(div);
  });

  // Bind surge attack inputs
  container.querySelectorAll('.surge-name').forEach(el => {
    el.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks[idx].name = (e.target as HTMLInputElement).value;
      emit();
    });
  });
  container.querySelectorAll('.surge-dice').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks[idx].weapon.damageDice = (e.target as HTMLSelectElement).value;
      emit();
    });
  });
  container.querySelectorAll('.surge-magic').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks[idx].weapon.magicBonus = parseInt((e.target as HTMLSelectElement).value);
      emit();
    });
  });
  container.querySelectorAll('.surge-abilmod').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks[idx].useAbilityMod = (e.target as HTMLInputElement).checked;
      emit();
    });
  });
  container.querySelectorAll('.surge-pact').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks[idx].isPactWeapon = (e.target as HTMLInputElement).checked;
      emit();
    });
  });
  container.querySelectorAll('.btn-remove-surge').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.actionSurge.extraAttacks.splice(idx, 1);
      renderActionSurgeSection();
      emit();
    });
  });
}

function renderRidersList(): void {
  const container = document.getElementById('riders-list')!;
  container.innerHTML = '';

  _config.riders.forEach((rider, idx) => {
    const div = document.createElement('div');
    div.className = 'rider-card';
    div.innerHTML = `
      <div class="attack-header">
        <input type="checkbox" class="rider-enabled" data-idx="${idx}" ${rider.enabled ? 'checked' : ''} />
        <span class="attack-num">${escapeHtml(rider.name)}</span>
        <button class="btn-icon btn-remove-rider" data-idx="${idx}" title="Remove">✕</button>
      </div>
      <div class="field-row">
        <label>Name</label>
        <input type="text" class="input-text rider-name" data-idx="${idx}" value="${escapeHtml(rider.name)}" />
      </div>
      <div class="field-row">
        <label>Damage</label>
        <input type="text" class="input-text rider-damage" data-idx="${idx}" value="${escapeHtml(rider.damage)}" placeholder="e.g. 1d6, 5d8" />
      </div>
      <div class="field-row">
        <label>Doubles on Crit</label>
        <input type="checkbox" class="rider-crit" data-idx="${idx}" ${rider.doublesOnCrit ? 'checked' : ''} />
      </div>
      <div class="field-row">
        <label>Trigger</label>
        <select class="input-select rider-condition" data-idx="${idx}">
          <option value="onEveryHit" ${rider.condition === 'onEveryHit' ? 'selected' : ''}>On every hit</option>
          <option value="firstHitPerTurn" ${rider.condition === 'firstHitPerTurn' ? 'selected' : ''}>First hit per turn</option>
          <option value="firstHitPactWeapon" ${rider.condition === 'firstHitPactWeapon' ? 'selected' : ''}>First hit (special weapon)</option>
          <option value="onCritPactWeaponOnly" ${rider.condition === 'onCritPactWeaponOnly' ? 'selected' : ''}>On crit (special weapon)</option>
          <option value="onCritAnyWeapon" ${rider.condition === 'onCritAnyWeapon' ? 'selected' : ''}>On crit (any weapon)</option>
          <option value="onHitWhileActive" ${rider.condition === 'onHitWhileActive' ? 'selected' : ''}>On hit while active</option>
        </select>
      </div>
      <div class="field-row">
        <label>Placement</label>
        <select class="input-select rider-placement" data-idx="${idx}">
          <option value="firstAvailable" ${rider.placement === 'firstAvailable' ? 'selected' : ''}>First available</option>
          <option value="preferSecondAttack" ${rider.placement === 'preferSecondAttack' ? 'selected' : ''}>Prefer 2nd attack</option>
          <option value="onlyCrit" ${rider.placement === 'onlyCrit' ? 'selected' : ''}>Only on crit</option>
        </select>
      </div>
      <div class="field-row">
        <label>Requires Bonus Action</label>
        <input type="checkbox" class="rider-ba" data-idx="${idx}" ${rider.requiresBonusAction ? 'checked' : ''} />
      </div>
      <div class="field-row">
        <label>Per-Turn Limit (0=∞)</label>
        <input type="number" class="input-number rider-limit" data-idx="${idx}" value="${rider.perTurnLimit}" min="0" max="10" />
      </div>
    `;
    container.appendChild(div);
  });

  // Bind rider inputs
  const bindRiderInput = (selector: string, field: keyof RiderConfig, transform?: (v: string) => unknown) => {
    container.querySelectorAll(selector).forEach(el => {
      const evtType = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox'
        ? 'change' : 'input';
      el.addEventListener(evtType, (e) => {
        const idx = parseInt((e.target as HTMLElement).dataset.idx!);
        const raw = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : (e.target as HTMLInputElement | HTMLSelectElement).value;
        const val = transform ? transform(raw as string) : raw;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_config.riders[idx] as any)[field] = val;
        if (field === 'name') renderRidersList();
        emit();
      });
    });
  };

  bindRiderInput('.rider-enabled', 'enabled');
  bindRiderInput('.rider-name', 'name');
  bindRiderInput('.rider-damage', 'damage');
  bindRiderInput('.rider-crit', 'doublesOnCrit');
  bindRiderInput('.rider-condition', 'condition');
  bindRiderInput('.rider-placement', 'placement');
  bindRiderInput('.rider-ba', 'requiresBonusAction');
  bindRiderInput('.rider-limit', 'perTurnLimit', (v) => parseInt(v));

  container.querySelectorAll('.btn-remove-rider').forEach(el => {
    el.addEventListener('click', (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.idx!);
      _config.riders.splice(idx, 1);
      renderRidersList();
      emit();
    });
  });
}

function bindStaticListeners(): void {
  // Character fields
  bind('cfg-name', 'input', v => { _config.name = v; });
  bind('cfg-level', 'change', v => { _config.level = parseInt(v); });
  bind('cfg-prof', 'change', v => { _config.proficiencyBonus = parseInt(v); });
  bind('cfg-abilmod', 'change', v => { _config.abilityMod = parseInt(v); });
  bind('cfg-fstyle', 'change', v => { _config.fightingStyle.bonus = parseInt(v); });
  bind('cfg-critrange', 'change', v => { _config.critRange = parseInt(v); });

  // Feats
  bindCheck('cfg-sharpshooter', c => { _config.feats.sharpshooter = c; _config.feats.gwm = false; });
  bindCheck('cfg-halflinglucky', c => { _config.feats.halflingLucky = c; });
  bindCheck('cfg-lucky', c => {
    _config.feats.lucky.enabled = c;
    toggleSubFields();
  });
  bind('cfg-luckypoints', 'change', v => { _config.feats.lucky.points = parseInt(v); });
  bindCheck('cfg-piercer', c => {
    _config.feats.piercer.enabled = c;
    toggleSubFields();
  });
  bind('cfg-piercerdie', 'change', v => { _config.feats.piercer.die = v; });
  bindCheck('cfg-xbowexpert', c => { _config.feats.crossbowExpert = c; });
  bindCheck('cfg-vex', c => { _config.weaponMastery.vex = c; });

  // Advantage
  bindCheck('cfg-surprise', c => { _config.advantageSources.surprise = c; });
  bindCheck('cfg-flanking', c => { _config.advantageSources.flanking = c; });
  bindCheck('cfg-luckyatk1', c => { _config.advantageSources.luckyOnAtk1 = c; });

  // Action Surge
  bindCheck('cfg-actionsurge', c => {
    if (!_config.actionSurge) {
      _config.actionSurge = { enabled: false, extraAttacks: [], usesPerRest: 1 };
    }
    _config.actionSurge.enabled = c;
    renderActionSurgeSection();
  });
  bind('cfg-actionsurge-uses', 'change', v => {
    if (!_config.actionSurge) return;
    _config.actionSurge.usesPerRest = parseInt(v);
  });

  // Add surge attack (mirrors main hand attacks)
  document.getElementById('btn-add-surge-attack')?.addEventListener('click', () => {
    if (!_config.actionSurge) return;
    // Mirror the first pact weapon attack as default
    const mainHandRef = _config.attacks.find(a => a.isPactWeapon) ?? _config.attacks[0];
    const newAtk: AttackConfig = mainHandRef
      ? {
          name: `Surge Attack ${_config.actionSurge.extraAttacks.length + 1}`,
          weapon: { ...mainHandRef.weapon },
          isPactWeapon: mainHandRef.isPactWeapon,
          useAbilityMod: mainHandRef.useAbilityMod,
          useSharpshooter: mainHandRef.useSharpshooter,
          order: _config.actionSurge.extraAttacks.length + 1,
        }
      : {
          name: `Surge Attack ${_config.actionSurge.extraAttacks.length + 1}`,
          weapon: { damageDice: '1d6', magicBonus: 0 },
          isPactWeapon: false,
          useAbilityMod: true,
          useSharpshooter: true,
          order: _config.actionSurge.extraAttacks.length + 1,
        };
    _config.actionSurge.extraAttacks.push(newAtk);
    renderActionSurgeSection();
    emit();
  });

  // Add attack
  document.getElementById('btn-add-attack')?.addEventListener('click', () => {
    const newAtk: AttackConfig = {
      name: `Attack ${_config.attacks.length + 1}`,
      weapon: { damageDice: '1d6', magicBonus: 0 },
      isPactWeapon: false,
      useAbilityMod: true,
      useSharpshooter: true,
      order: _config.attacks.length + 1,
    };
    _config.attacks.push(newAtk);
    renderAttacksList();
    emit();
  });

  // Add rider
  document.getElementById('btn-add-rider')?.addEventListener('click', () => {
    const newRider: RiderConfig = {
      name: 'New Rider',
      damage: '1d6',
      doublesOnCrit: false,
      condition: 'onEveryHit' as RiderCondition,
      placement: 'firstAvailable' as RiderPlacement,
      requiresBonusAction: false,
      perTurnLimit: 0,
      enabled: true,
    };
    _config.riders.push(newRider);
    renderRidersList();
    emit();
  });

  // Collapsible sections
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = (header as HTMLElement).dataset.toggle;
      if (!targetId) return;
      const body = document.getElementById(targetId);
      const icon = header.querySelector('.toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      if (icon) icon.textContent = isHidden ? '▾' : '▸';
    });
  });
}

function bind(id: string, evt: string, setter: (val: string) => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(evt, (e) => {
    setter((e.target as HTMLInputElement).value);
    emit();
  });
}

function bindCheck(id: string, setter: (checked: boolean) => void): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', (e) => {
    setter((e.target as HTMLInputElement).checked);
    emit();
  });
}

function setVal(id: string, val: string | number): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (el) el.value = String(val);
}

function setChecked(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
