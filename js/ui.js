/*
 * Library ASBA — Library Management System
 * ui.js — icon set and the shared presentation components.
 *
 * Dialogs use the native <dialog> element, which supplies the focus trap,
 * Escape handling and inert background that a div-based modal has to
 * reimplement (usually incompletely).
 */
(function (window, document) {
  'use strict';

  var LMS = window.LMS;
  var html = LMS.html;
  var raw = LMS.raw;

  /* ==========================================================================
   * 1. Icons
   *
   * A small stroked set drawn on a 24x24 grid. The previous build used
   * typographic glyphs (⌂ ♙ ▥) which render inconsistently across platforms
   * and are read aloud by screen readers as their Unicode names.
   * ========================================================================== */

  var ICON_PATHS = {
    dashboard: '<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.8 9v10.5h12.4V9"/><path d="M10 19.5v-5h4v5"/>',
    staff: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.9-3.2 3-4.8 5.5-4.8s4.6 1.6 5.5 4.8"/><path d="M16 6.2a3 3 0 0 1 0 5.8"/><path d="M17.5 14.9c1.6.6 2.7 2 3.2 4"/>',
    students: '<path d="M12 4.2 21 8.5 12 12.8 3 8.5z"/><path d="M6.8 10.6v4.3c0 1.6 2.3 2.9 5.2 2.9s5.2-1.3 5.2-2.9v-4.3"/><path d="M20.2 9.1v5"/>',
    books: '<path d="M4.2 5.2A1.4 1.4 0 0 1 5.6 3.8h4.2a2 2 0 0 1 2 2v13a1.8 1.8 0 0 0-1.8-1.4H4.2z"/><path d="M19.8 5.2a1.4 1.4 0 0 0-1.4-1.4h-4.2a2 2 0 0 0-2 2v13a1.8 1.8 0 0 1 1.8-1.4h5.8z"/>',
    issue: '<path d="M4 12h12.5"/><path d="M12.5 7 17.5 12l-5 5"/><path d="M20 4.5v15"/>',
    receive: '<path d="M20 12H7.5"/><path d="M11.5 7 6.5 12l5 5"/><path d="M4 4.5v15"/>',
    reservations: '<path d="M6.5 4h11v16l-5.5-4-5.5 4z"/>',
    payments: '<rect x="3" y="6" width="18" height="12.5" rx="2.4"/><path d="M3 10.2h18"/><path d="M6.8 14.6h3.4"/>',
    reports: '<path d="M4 20h16"/><path d="M7 20V12.5"/><path d="M12 20V5"/><path d="M17 20v-9.5"/>',
    settings: '<path d="M3.8 8h8.4"/><path d="M16.6 8h3.6"/><circle cx="14.4" cy="8" r="2.2"/><path d="M3.8 16h4.6"/><path d="M12.8 16h7.4"/><circle cx="10.6" cy="16" r="2.2"/>',
    profile: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20c1.1-3.7 3.8-5.6 7.2-5.6s6.1 1.9 7.2 5.6"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20 20"/>',
    plus: '<path d="M12 5.5v13"/><path d="M5.5 12h13"/>',
    close: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>',
    check: '<path d="M4.8 12.6 9.8 17.5 19.2 6.8"/>',
    alert: '<path d="M12 4.4 21 19.6H3z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.4V12l3.2 2"/>',
    copies: '<rect x="3.5" y="7.5" width="13" height="13" rx="2"/><path d="M7.5 4.5h11a2 2 0 0 1 2 2v11"/>',
    logout: '<path d="M14 5.5H6.5A1.5 1.5 0 0 0 5 7v10a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M17 8.5 20.5 12 17 15.5"/><path d="M20 12h-9.5"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    empty: '<circle cx="12" cy="12" r="7.8"/><path d="M9.2 12h5.6"/>',
    library: '<path d="M12 6.4C10.2 4.9 7.6 4.3 4.5 4.3v12.4c3.1 0 5.7.6 7.5 2.1 1.8-1.5 4.4-2.1 7.5-2.1V4.3c-3.1 0-5.7.6-7.5 2.1z"/><path d="M12 6.4v12.4"/>'
  };

  function icon(name, size) {
    var path = ICON_PATHS[name];
    if (!path) return raw('');
    var dimension = size || 18;
    return raw(
      '<svg class="icon" viewBox="0 0 24 24" width="' + dimension + '" height="' + dimension +
      '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>'
    );
  }

  /* ==========================================================================
   * 2. Toast
   * ========================================================================== */

  var toastTimer = null;

  function toast(message, tone) {
    var element = document.getElementById('toast');
    if (!element) return;

    element.textContent = message;
    element.className = 'toast toast--visible' + (tone ? ' toast--' + tone : '');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      element.className = 'toast';
    }, 4000);
  }

  /* ==========================================================================
   * 3. Dialogs
   * ========================================================================== */

  var modal = {
    open: function (options) {
      var dialog = document.getElementById('appModal');
      if (!dialog) return;

      document.getElementById('appModalTitle').textContent = options.title || '';
      var description = document.getElementById('appModalDescription');
      description.textContent = options.description || '';
      description.hidden = !options.description;

      var body = document.getElementById('appModalBody');
      body.innerHTML = String(options.body || '');
      dialog.classList.toggle('dialog--wide', options.size === 'wide');

      if (!dialog.open) dialog.showModal();

      var firstField = body.querySelector('input:not([type=hidden]), select, textarea, button');
      if (firstField) firstField.focus();
    },

    close: function () {
      var dialog = document.getElementById('appModal');
      if (dialog && dialog.open) dialog.close();
    },

    isOpen: function () {
      var dialog = document.getElementById('appModal');
      return Boolean(dialog && dialog.open);
    }
  };

  /**
   * Promise-based replacement for window.confirm, so destructive actions can
   * explain their consequences instead of showing a bare browser string.
   */
  function confirmAction(options) {
    return new Promise(function (resolve) {
      var dialog = document.getElementById('confirmModal');
      if (!dialog) {
        resolve(window.confirm(options.message || 'Are you sure?'));
        return;
      }

      document.getElementById('confirmModalTitle').textContent = options.title || 'Please confirm';
      document.getElementById('confirmModalMessage').textContent = options.message || '';

      var confirmButton = document.getElementById('confirmModalAccept');
      confirmButton.textContent = options.confirmLabel || 'Confirm';
      confirmButton.className = 'btn ' + (options.tone === 'danger' ? 'btn--danger' : 'btn--primary');

      function settle(result) {
        dialog.removeEventListener('close', onClose);
        confirmButton.removeEventListener('click', onAccept);
        if (dialog.open) dialog.close();
        resolve(result);
      }

      function onAccept() { settle(true); }
      function onClose() { settle(false); }

      confirmButton.addEventListener('click', onAccept);
      dialog.addEventListener('close', onClose);

      dialog.showModal();
      document.getElementById('confirmModalCancel').focus();
    });
  }

  /* ==========================================================================
   * 4. Layout components
   * ========================================================================== */

  function pageHeader(options) {
    return html`
      <header class="page-header">
        <div class="page-header__text">
          <p class="eyebrow">${options.eyebrow}</p>
          <h1>${options.title}</h1>
          ${options.description ? html`<p class="page-header__description">${options.description}</p>` : ''}
        </div>
        ${options.actions ? html`<div class="page-header__actions">${options.actions}</div>` : ''}
      </header>`;
  }

  function statGrid(items) {
    return html`
      <div class="stat-grid">
        ${items.map(function (item) {
          return html`
            <article class="stat">
              <div class="stat__head">
                <span class="stat__label">${item.label}</span>
                <span class="stat__icon stat__icon--${item.tone || 'default'}">${icon(item.icon, 16)}</span>
              </div>
              <p class="stat__value">${item.value}</p>
              <p class="stat__note">${item.note}</p>
            </article>`;
        })}
      </div>`;
  }

  function badge(text, tone) {
    return html`<span class="badge badge--${tone || 'neutral'}">${text}</span>`;
  }

  function emptyState(options) {
    return html`
      <div class="empty-state">
        <span class="empty-state__icon">${icon(options.icon || 'empty', 22)}</span>
        <p class="empty-state__title">${options.title}</p>
        ${options.description ? html`<p class="empty-state__description">${options.description}</p>` : ''}
      </div>`;
  }

  /**
   * @param {{columns: Array<{label: string, align?: string, width?: string}>,
   *          rows: Array<Array<*>>, empty?: object}} options
   */
  function dataTable(options) {
    var columns = options.columns;

    if (!options.rows.length) {
      return html`
        <div class="table-wrap">
          <table class="data-table">
            <thead>${headerRow(columns)}</thead>
            <tbody>
              <tr>
                <td colspan="${columns.length}">
                  ${emptyState(options.empty || { title: 'Nothing to show yet.' })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    return html`
      <div class="table-wrap">
        <table class="data-table">
          <thead>${headerRow(columns)}</thead>
          <tbody>
            ${options.rows.map(function (cells) {
              return html`<tr>${cells.map(function (cell, index) {
                var column = columns[index] || {};
                return html`<td class="${column.align ? 'align-' + column.align : ''}">${cell}</td>`;
              })}</tr>`;
            })}
          </tbody>
        </table>
      </div>`;
  }

  function headerRow(columns) {
    return html`<tr>${columns.map(function (column) {
      return html`<th scope="col" class="${column.align ? 'align-' + column.align : ''}">${column.label}</th>`;
    })}</tr>`;
  }

  function card(options) {
    return html`
      <section class="card">
        ${options.title ? html`
          <div class="card__head">
            <h2>${options.title}</h2>
            ${options.meta ? html`<span class="card__meta">${options.meta}</span>` : ''}
          </div>` : ''}
        ${options.body}
      </section>`;
  }

  /* ==========================================================================
   * 5. Forms
   * ========================================================================== */

  /** Collect trimmed values from a form's named controls. */
  function formValues(form) {
    var values = {};
    new FormData(form).forEach(function (value, key) {
      values[key] = typeof value === 'string' ? value.trim() : value;
    });
    return values;
  }

  function textField(options) {
    return html`
      <div class="field ${options.full ? 'field--full' : ''}">
        <label for="${options.id || options.name}">${options.label}</label>
        <input
          id="${options.id || options.name}"
          name="${options.name}"
          type="${options.type || 'text'}"
          value="${options.value === undefined || options.value === null ? '' : options.value}"
          placeholder="${options.placeholder || ''}"
          ${raw(options.required ? 'required' : '')}
          ${raw(options.autocomplete ? 'autocomplete="' + LMS.escapeHTML(options.autocomplete) + '"' : '')}
          ${raw(options.maxlength ? 'maxlength="' + Number(options.maxlength) + '"' : '')}
          ${raw(options.min !== undefined ? 'min="' + Number(options.min) + '"' : '')}
          ${raw(options.max !== undefined ? 'max="' + Number(options.max) + '"' : '')}
          ${raw(options.step ? 'step="' + LMS.escapeHTML(options.step) + '"' : '')}
          ${raw(options.readonly ? 'readonly' : '')}>
        ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
      </div>`;
  }

  function textArea(options) {
    return html`
      <div class="field field--full">
        <label for="${options.name}">${options.label}</label>
        <textarea
          id="${options.name}"
          name="${options.name}"
          rows="${options.rows || 3}"
          maxlength="${options.maxlength || 400}"
          placeholder="${options.placeholder || ''}">${options.value || ''}</textarea>
        ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
      </div>`;
  }

  function selectField(options) {
    return html`
      <div class="field ${options.full ? 'field--full' : ''}">
        <label for="${options.name}">${options.label}</label>
        <select id="${options.name}" name="${options.name}" ${raw(options.required ? 'required' : '')}>
          ${options.placeholder ? html`<option value="">${options.placeholder}</option>` : ''}
          ${options.options.map(function (option) {
            return html`<option value="${option.value}" ${raw(String(option.value) === String(options.value) ? 'selected' : '')}>${option.label}</option>`;
          })}
        </select>
        ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
      </div>`;
  }

  function readonlyField(options) {
    return html`
      <div class="field">
        <label for="${options.name}">${options.label}</label>
        <input id="${options.name}" class="field__readonly" value="${options.value}" readonly disabled>
        ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
      </div>`;
  }

  function formActions(options) {
    return html`
      <div class="form-actions">
        ${options.cancel === false ? '' : html`
          <button type="button" class="btn btn--ghost" data-action="${options.cancelAction || 'close-modal'}">
            ${options.cancelLabel || 'Cancel'}
          </button>`}
        <button type="submit" class="btn btn--primary">${options.submitLabel || 'Save'}</button>
      </div>`;
  }

  LMS.ui = {
    icon: icon,
    toast: toast,
    modal: modal,
    confirm: confirmAction,
    pageHeader: pageHeader,
    statGrid: statGrid,
    badge: badge,
    emptyState: emptyState,
    dataTable: dataTable,
    card: card,
    formValues: formValues,
    textField: textField,
    textArea: textArea,
    selectField: selectField,
    readonlyField: readonlyField,
    formActions: formActions
  };
})(window, document);
