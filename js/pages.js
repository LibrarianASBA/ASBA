/*
 * Library ASBA — Library Management System
 * pages.js — page renderers, plus the actions and form handlers they declare.
 *
 * Pages return markup; they never attach listeners. Every interactive element
 * carries a data-action or data-form attribute which the router in
 * dashboard.js dispatches, so there is no inline JavaScript anywhere in the
 * HTML and nothing depends on a function happening to be global.
 */
(function (window) {
  'use strict';

  var LMS = window.LMS;
  var html = LMS.html;
  var ui = LMS.ui;
  var dates = LMS.dates;
  var query = LMS.query;
  var money = LMS.money;

  function db() { return LMS.store.data; }
  function me() { return LMS.app.account; }
  function role() { return LMS.app.role; }
  function settings() { return LMS.store.data.settings; }

  /* Search text survives a re-render, so saving a record no longer clears the
   * filter the user was working with. */
  var filters = {
    students: '',
    books: '',
    returns: '',
    fines: '',
    catalog: ''
  };

  /* ==========================================================================
   * Shared fragments
   * ========================================================================== */

  function searchBar(key, placeholder) {
    return html`
      <div class="search">
        <span class="search__icon">${ui.icon('search', 16)}</span>
        <label class="visually-hidden" for="search-${key}">${placeholder}</label>
        <input
          id="search-${key}"
          type="search"
          data-filter="${key}"
          value="${filters[key]}"
          placeholder="${placeholder}"
          autocomplete="off">
      </div>`;
  }

  function matches(text, term) {
    return String(text || '').toLowerCase().indexOf(term.toLowerCase()) !== -1;
  }

  function loanStatusBadge(loan) {
    if (loan.status === 'returned') return ui.badge('Returned', 'neutral');
    var overdue = dates.daysOverdue(loan.dueDate);
    if (overdue > 0) return ui.badge(overdue + (overdue === 1 ? ' day late' : ' days late'), 'danger');
    return ui.badge('On loan', 'info');
  }

  function copyStatusBadge(status) {
    var tones = { available: 'success', issued: 'info', lost: 'danger', damaged: 'warning' };
    var labels = { available: 'Available', issued: 'On loan', lost: 'Lost', damaged: 'Damaged' };
    return ui.badge(labels[status] || status, tones[status] || 'neutral');
  }

  function passwordNotice() {
    if (!me().mustChangePassword) return '';
    return html`
      <div class="notice notice--warning">
        <span class="notice__icon">${ui.icon('alert', 18)}</span>
        <div>
          <p class="notice__title">Set your own password</p>
          <p>You are signed in with a temporary password. Choose a new one on your profile page.</p>
        </div>
        <button class="btn btn--ghost" data-action="go" data-page="profile">Open profile</button>
      </div>`;
  }

  /* ==========================================================================
   * Dashboard
   * ========================================================================== */

  function home() {
    if (role() === 'member') return memberHome();

    var data = db();
    var active = query.activeLoans();
    var overdue = query.overdueLoans();
    var available = data.copies.filter(function (copy) { return copy.status === 'available'; });
    var isAdmin = role() === 'admin';

    return html`
      ${ui.pageHeader({
        eyebrow: isAdmin ? 'Administration' : 'Circulation desk',
        title: isAdmin ? 'Library overview' : 'Today at the library',
        description: isAdmin
          ? 'Staff accounts, lending rules and overall activity across the library.'
          : 'Issues, returns and anything that needs attention today.'
      })}
      ${passwordNotice()}
      ${ui.statGrid([
        { label: 'Titles in catalogue', value: data.books.length, icon: 'books', note: data.copies.length + ' physical copies' },
        { label: 'Available now', value: available.length, icon: 'check', tone: 'success', note: 'Copies on the shelf' },
        { label: 'On loan', value: active.length, icon: 'issue', tone: 'info', note: 'Currently issued' },
        { label: 'Overdue', value: overdue.length, icon: 'alert', tone: overdue.length ? 'danger' : 'default', note: overdue.length ? 'Needs follow-up' : 'Nothing outstanding' }
      ])}
      <div class="layout-split">
        ${ui.card({
          title: 'Recent circulation',
          meta: 'Last six transactions',
          body: recentCirculationTable()
        })}
        ${ui.card({
          title: 'Quick actions',
          body: html`
            <div class="action-stack">
              ${isAdmin
                ? html`
                    <button class="btn btn--primary" data-action="librarian-new">${ui.icon('plus', 16)} Add librarian</button>
                    <button class="btn btn--ghost" data-action="go" data-page="settings">${ui.icon('settings', 16)} Lending rules</button>
                    <button class="btn btn--ghost" data-action="go" data-page="reports">${ui.icon('reports', 16)} View reports</button>`
                : html`
                    <button class="btn btn--primary" data-action="go" data-page="issue">${ui.icon('issue', 16)} Issue a book</button>
                    <button class="btn btn--ghost" data-action="go" data-page="return">${ui.icon('receive', 16)} Return a book</button>
                    <button class="btn btn--ghost" data-action="student-new">${ui.icon('plus', 16)} Register student</button>
                    <button class="btn btn--ghost" data-action="book-new">${ui.icon('plus', 16)} Add book</button>`}
            </div>
            ${isAdmin ? adminSummary() : librarianSummary()}`
        })}
      </div>`;
  }

  function adminSummary() {
    var librarians = db().users.filter(function (user) { return user.role === 'librarian'; });
    var activeLibrarians = librarians.filter(function (user) { return user.status === 'active'; });
    return html`
      <dl class="summary-list">
        <div><dt>Librarian accounts</dt><dd>${activeLibrarians.length} active of ${librarians.length}</dd></div>
        <div><dt>Registered students</dt><dd>${db().members.length}</dd></div>
        <div><dt>Loan period</dt><dd>${settings().loanDays} days</dd></div>
        <div><dt>Overdue fine</dt><dd>${money(settings().finePerDay)} per day</dd></div>
      </dl>`;
  }

  function librarianSummary() {
    var pending = query.pendingReservations().length;
    var unpaid = db().fines.filter(function (fine) { return fine.status !== 'paid'; });
    var outstanding = unpaid.reduce(function (total, fine) { return total + (fine.amount - fine.paid); }, 0);
    return html`
      <dl class="summary-list">
        <div><dt>Reservations waiting</dt><dd>${pending}</dd></div>
        <div><dt>Unpaid fines</dt><dd>${unpaid.length} — ${money(outstanding)}</dd></div>
        <div><dt>Active students</dt><dd>${db().members.filter(function (m) { return m.status === 'active'; }).length}</dd></div>
      </dl>`;
  }

  function recentCirculationTable() {
    var rows = db().loans
      .slice()
      .sort(function (a, b) { return b.id - a.id; })
      .slice(0, 6)
      .map(function (loan) {
        var copy = query.copy(loan.copyId);
        var book = copy ? query.book(copy.bookId) : null;
        var member = query.member(loan.memberId);
        return [
          html`<strong>${book ? book.title : 'Withdrawn title'}</strong>
               <span class="cell-sub">${copy ? copy.accession : '—'}</span>`,
          member ? member.name : 'Removed student',
          dates.format(loan.issueDate),
          loanStatusBadge(loan)
        ];
      });

    return ui.dataTable({
      columns: [{ label: 'Book' }, { label: 'Student' }, { label: 'Issued' }, { label: 'Status' }],
      rows: rows,
      empty: { icon: 'issue', title: 'No loans recorded yet.', description: 'Issued books will appear here.' }
    });
  }

  function memberHome() {
    var member = me();
    var active = query.loansOfMember(member.id, 'issued');
    var overdue = active.filter(function (loan) { return dates.daysOverdue(loan.dueDate) > 0; });
    var outstanding = query.outstandingFor(member.id);
    var reservations = db().reservations.filter(function (item) {
      return item.memberId === member.id && item.status === 'pending';
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'My library',
        title: 'Welcome back, ' + member.name.split(' ')[0],
        description: 'Your current loans, due dates and reservations.'
      })}
      ${passwordNotice()}
      ${ui.statGrid([
        { label: 'Books on loan', value: active.length, icon: 'books', note: 'Limit of ' + member.maxLoans },
        { label: 'Overdue', value: overdue.length, icon: 'alert', tone: overdue.length ? 'danger' : 'default', note: overdue.length ? 'Please return these' : 'Nothing overdue' },
        { label: 'Outstanding fines', value: money(outstanding), icon: 'payments', tone: outstanding > 0 ? 'warning' : 'default', note: outstanding > 0 ? 'Payable at the desk' : 'Nothing to pay' },
        { label: 'Reservations', value: reservations.length, icon: 'reservations', note: reservations.length ? 'Waiting for a copy' : 'None placed' }
      ])}
      ${ui.card({
        title: 'Books I have out',
        meta: active.length + (active.length === 1 ? ' loan' : ' loans'),
        body: memberLoanTable(active)
      })}`;
  }

  function memberLoanTable(loans) {
    var rows = loans.map(function (loan) {
      var copy = query.copy(loan.copyId);
      var book = copy ? query.book(copy.bookId) : null;
      return [
        html`<strong>${book ? book.title : 'Withdrawn title'}</strong>
             <span class="cell-sub">${copy ? copy.accession : '—'}</span>`,
        dates.format(loan.issueDate),
        dates.format(loan.dueDate),
        loanStatusBadge(loan)
      ];
    });

    return ui.dataTable({
      columns: [{ label: 'Book' }, { label: 'Issued' }, { label: 'Due back' }, { label: 'Status' }],
      rows: rows,
      empty: { icon: 'books', title: 'You have no books on loan.', description: 'Search the catalogue to find something to borrow.' }
    });
  }

  /* ==========================================================================
   * Librarian accounts (administrator only)
   * ========================================================================== */

  function librarians() {
    var accounts = db().users.filter(function (user) { return user.role === 'librarian'; });

    var rows = accounts.map(function (user) {
      return [
        html`<strong>${user.name}</strong><span class="cell-sub">${user.designation || 'Librarian'}</span>`,
        html`<span class="cell-mono">${user.email}</span>`,
        user.department || '—',
        dates.format(user.createdOn),
        user.status === 'active' ? ui.badge('Active', 'success') : ui.badge('Deactivated', 'danger'),
        html`
          <div class="row-actions">
            <button class="btn btn--small btn--ghost" data-action="librarian-reset" data-id="${user.id}">Reset password</button>
            <button class="btn btn--small btn--ghost" data-action="librarian-toggle" data-id="${user.id}">
              ${user.status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          </div>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Administration',
        title: 'Librarian accounts',
        description: 'Create staff accounts and control who can sign in to the circulation desk.',
        actions: html`<button class="btn btn--primary" data-action="librarian-new">${ui.icon('plus', 16)} Add librarian</button>`
      })}
      ${passwordNotice()}
      ${ui.card({
        title: 'Staff',
        meta: accounts.length + (accounts.length === 1 ? ' account' : ' accounts'),
        body: ui.dataTable({
          columns: [
            { label: 'Librarian' }, { label: 'Email' }, { label: 'Department' },
            { label: 'Added' }, { label: 'Status' }, { label: 'Actions' }
          ],
          rows: rows,
          empty: { icon: 'staff', title: 'No librarian accounts yet.', description: 'Add one so the circulation desk can be staffed.' }
        })
      })}`;
  }

  function librarianForm() {
    return html`
      <form data-form="librarian-create" novalidate>
        <div class="field-grid">
          ${ui.textField({ name: 'name', label: 'Full name', required: true, maxlength: 80, autocomplete: 'name' })}
          ${ui.textField({ name: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email' })}
          ${ui.textField({ name: 'department', label: 'Department', placeholder: 'Circulation Desk' })}
          ${ui.textField({ name: 'designation', label: 'Designation', placeholder: 'Assistant Librarian' })}
          ${ui.textField({ name: 'phone', label: 'Phone', placeholder: '+91 98765 43210', autocomplete: 'tel' })}
          ${ui.textField({
            name: 'password', label: 'Temporary password', type: 'password', required: true,
            autocomplete: 'new-password', hint: 'At least 6 characters. They will be asked to change it.'
          })}
        </div>
        ${ui.formActions({ submitLabel: 'Create account' })}
      </form>`;
  }

  /* ==========================================================================
   * Students
   * ========================================================================== */

  function students() {
    var term = filters.students;
    var list = db().members.filter(function (member) {
      return !term || [member.name, member.email, member.code, member.department, member.course]
        .some(function (field) { return matches(field, term); });
    });

    var rows = list.map(function (member) {
      var active = query.loansOfMember(member.id, 'issued').length;
      var outstanding = query.outstandingFor(member.id);
      return [
        html`<strong>${member.name}</strong><span class="cell-sub cell-mono">${member.code}</span>`,
        html`<span class="cell-mono">${member.email}</span>`,
        member.course || member.department || '—',
        html`<span class="cell-mono">${active} / ${member.maxLoans}</span>`,
        outstanding > 0 ? ui.badge(money(outstanding), 'warning') : html`<span class="cell-muted">None</span>`,
        member.status === 'active' ? ui.badge('Active', 'success') : ui.badge('Suspended', 'danger'),
        html`
          <div class="row-actions">
            <button class="btn btn--small btn--ghost" data-action="student-view" data-id="${member.id}">Details</button>
            <button class="btn btn--small btn--ghost" data-action="student-reset" data-id="${member.id}">Reset password</button>
            <button class="btn btn--small btn--ghost" data-action="student-toggle" data-id="${member.id}">
              ${member.status === 'active' ? 'Suspend' : 'Reinstate'}
            </button>
          </div>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Membership',
        title: 'Students',
        description: 'Register borrowers, set their loan limits and manage account access.',
        actions: html`<button class="btn btn--primary" data-action="student-new">${ui.icon('plus', 16)} Register student</button>`
      })}
      ${passwordNotice()}
      ${ui.card({
        body: html`
          <div class="toolbar">
            <p class="toolbar__count"><strong>${list.length}</strong> of ${db().members.length} students</p>
            ${searchBar('students', 'Search by name, code, email or course')}
          </div>
          ${ui.dataTable({
            columns: [
              { label: 'Student' }, { label: 'Email' }, { label: 'Course' },
              { label: 'Loans' }, { label: 'Fines' }, { label: 'Status' }, { label: 'Actions' }
            ],
            rows: rows,
            empty: { icon: 'students', title: term ? 'No students match that search.' : 'No students registered yet.' }
          })}`
      })}`;
  }

  function studentForm() {
    return html`
      <form data-form="student-create" novalidate>
        <div class="field-grid">
          ${ui.textField({ name: 'name', label: 'Full name', required: true, maxlength: 80, autocomplete: 'name' })}
          ${ui.textField({ name: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email' })}
          ${ui.textField({ name: 'course', label: 'Course', placeholder: 'B.Tech Computer Science' })}
          ${ui.textField({ name: 'department', label: 'Department', placeholder: 'Computer Science' })}
          ${ui.textField({ name: 'semester', label: 'Semester', placeholder: '5th Semester' })}
          ${ui.textField({ name: 'phone', label: 'Phone', placeholder: '+91 98765 43210', autocomplete: 'tel' })}
          ${ui.textField({
            name: 'maxLoans', label: 'Borrowing limit', type: 'number',
            value: settings().maxLoans, min: 1, max: 20, required: true
          })}
          ${ui.textField({
            name: 'password', label: 'Temporary password', type: 'password', required: true,
            autocomplete: 'new-password', hint: 'At least 6 characters.'
          })}
        </div>
        ${ui.formActions({ submitLabel: 'Register student' })}
      </form>`;
  }

  function studentDetail(member) {
    var loans = query.loansOfMember(member.id).slice().sort(function (a, b) { return b.id - a.id; });
    var rows = loans.slice(0, 12).map(function (loan) {
      var book = query.bookOfCopy(loan.copyId);
      return [
        book ? book.title : 'Withdrawn title',
        dates.format(loan.issueDate),
        loan.status === 'returned' ? dates.format(loan.returnDate) : dates.format(loan.dueDate),
        loanStatusBadge(loan)
      ];
    });

    return html`
      <dl class="detail-list">
        <div><dt>Member code</dt><dd class="cell-mono">${member.code}</dd></div>
        <div><dt>Email</dt><dd class="cell-mono">${member.email}</dd></div>
        <div><dt>Phone</dt><dd>${member.phone || '—'}</dd></div>
        <div><dt>Course</dt><dd>${member.course || '—'}</dd></div>
        <div><dt>Semester</dt><dd>${member.semester || '—'}</dd></div>
        <div><dt>Registered</dt><dd>${dates.format(member.createdOn)}</dd></div>
        <div><dt>Borrowing limit</dt><dd>${member.maxLoans} books</dd></div>
        <div><dt>Outstanding fines</dt><dd>${money(query.outstandingFor(member.id))}</dd></div>
      </dl>
      <h3 class="detail-heading">Loan history</h3>
      ${ui.dataTable({
        columns: [{ label: 'Book' }, { label: 'Issued' }, { label: 'Due / returned' }, { label: 'Status' }],
        rows: rows,
        empty: { icon: 'books', title: 'This student has not borrowed anything yet.' }
      })}`;
  }

  /* ==========================================================================
   * Catalogue management
   * ========================================================================== */

  function books() {
    var term = filters.books;
    var list = db().books.filter(function (book) {
      return !term || [book.title, book.isbn, book.author, book.category, book.publisher]
        .some(function (field) { return matches(field, term); });
    });

    var rows = list.map(function (book) {
      var copies = query.copiesOf(book.id);
      var available = copies.filter(function (copy) { return copy.status === 'available'; }).length;
      return [
        html`<strong>${book.title}</strong><span class="cell-sub">${book.author || 'Unknown author'}</span>`,
        html`<span class="cell-mono">${book.isbn || '—'}</span>`,
        book.category || '—',
        html`<span class="cell-mono">${copies.length}</span>`,
        available ? ui.badge(available + ' on shelf', 'success') : ui.badge('All out', 'danger'),
        html`
          <div class="row-actions">
            <button class="btn btn--small btn--ghost" data-action="book-copies" data-id="${book.id}">Copies</button>
            <button class="btn btn--small btn--ghost" data-action="book-view" data-id="${book.id}">Details</button>
            <button class="btn btn--small btn--danger-quiet" data-action="book-remove" data-id="${book.id}">Remove</button>
          </div>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Catalogue',
        title: 'Books and copies',
        description: 'Manage titles, their physical copies and shelf locations.',
        actions: html`<button class="btn btn--primary" data-action="book-new">${ui.icon('plus', 16)} Add book</button>`
      })}
      ${passwordNotice()}
      ${ui.card({
        body: html`
          <div class="toolbar">
            <p class="toolbar__count"><strong>${list.length}</strong> titles · ${db().copies.length} copies</p>
            ${searchBar('books', 'Search by title, author, ISBN or category')}
          </div>
          ${ui.dataTable({
            columns: [
              { label: 'Title' }, { label: 'ISBN' }, { label: 'Category' },
              { label: 'Copies' }, { label: 'Availability' }, { label: 'Actions' }
            ],
            rows: rows,
            empty: { icon: 'books', title: term ? 'No titles match that search.' : 'The catalogue is empty.' }
          })}`
      })}`;
  }

  function bookForm() {
    return html`
      <form data-form="book-create" novalidate>
        <div class="field-grid">
          ${ui.textField({ name: 'title', label: 'Title', required: true, maxlength: 150, full: true })}
          ${ui.textField({ name: 'author', label: 'Author', maxlength: 100 })}
          ${ui.textField({ name: 'isbn', label: 'ISBN', maxlength: 20, hint: 'Optional, but must be unique.' })}
          ${ui.textField({ name: 'category', label: 'Category', placeholder: 'Programming' })}
          ${ui.textField({ name: 'publisher', label: 'Publisher' })}
          ${ui.textField({ name: 'year', label: 'Year of publication', type: 'number', min: 1000, max: new Date().getFullYear() + 1 })}
          ${ui.textField({ name: 'accession', label: 'First accession number', placeholder: 'LIB-001', hint: 'A copy is created with this number.' })}
          ${ui.textField({ name: 'shelf', label: 'Shelf location', placeholder: 'A-01' })}
          ${ui.textArea({ name: 'description', label: 'Description', maxlength: 400, placeholder: 'A short summary shown in the catalogue.' })}
        </div>
        ${ui.formActions({ submitLabel: 'Add to catalogue' })}
      </form>`;
  }

  function bookDetail(book) {
    var copies = query.copiesOf(book.id);
    var available = copies.filter(function (copy) { return copy.status === 'available'; });
    return html`
      <dl class="detail-list">
        <div><dt>Author</dt><dd>${book.author || '—'}</dd></div>
        <div><dt>ISBN</dt><dd class="cell-mono">${book.isbn || '—'}</dd></div>
        <div><dt>Category</dt><dd>${book.category || '—'}</dd></div>
        <div><dt>Publisher</dt><dd>${book.publisher || '—'}</dd></div>
        <div><dt>Year</dt><dd>${book.year || '—'}</dd></div>
        <div><dt>Availability</dt><dd>${available.length} of ${copies.length} copies on the shelf</dd></div>
      </dl>
      ${book.description
        ? html`<h3 class="detail-heading">Description</h3><p class="detail-prose">${book.description}</p>`
        : html`<p class="detail-prose cell-muted">No description recorded for this title.</p>`}`;
  }

  function copiesDialog(book) {
    var copies = query.copiesOf(book.id);
    var rows = copies.map(function (copy) {
      var loan = query.activeLoans().find(function (item) { return item.copyId === copy.id; });
      var borrower = loan ? query.member(loan.memberId) : null;
      return [
        html`<span class="cell-mono">${copy.accession}</span>`,
        copy.shelf || '—',
        copyStatusBadge(copy.status),
        borrower ? borrower.name : html`<span class="cell-muted">—</span>`,
        html`
          <div class="row-actions">
            ${copy.status === 'issued'
              ? html`<span class="cell-muted">On loan</span>`
              : html`
                  <select class="select-inline" data-action="copy-status" data-id="${copy.id}" aria-label="Status for copy ${copy.accession}">
                    ${['available', 'lost', 'damaged'].map(function (status) {
                      return html`<option value="${status}" ${LMS.raw(copy.status === status ? 'selected' : '')}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`;
                    })}
                  </select>
                  <button class="btn btn--small btn--danger-quiet" data-action="copy-remove" data-id="${copy.id}">Remove</button>`}
          </div>`
      ];
    });

    return html`
      ${ui.dataTable({
        columns: [{ label: 'Accession' }, { label: 'Shelf' }, { label: 'Status' }, { label: 'Borrower' }, { label: 'Actions' }],
        rows: rows,
        empty: { icon: 'copies', title: 'No physical copies recorded.', description: 'Add one below so the title can be issued.' }
      })}
      <form data-form="copy-create" class="inline-form" novalidate>
        <input type="hidden" name="bookId" value="${book.id}">
        <div class="field-grid">
          ${ui.textField({ name: 'accession', label: 'Accession number', required: true, placeholder: 'LIB-002' })}
          ${ui.textField({ name: 'shelf', label: 'Shelf location', placeholder: 'A-01' })}
        </div>
        ${ui.formActions({ submitLabel: 'Add copy', cancel: false })}
      </form>`;
  }

  /* ==========================================================================
   * Issue
   * ========================================================================== */

  function issue() {
    var data = db();
    var members = data.members.filter(function (member) { return member.status === 'active'; });
    var available = data.copies.filter(function (copy) { return copy.status === 'available'; });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Circulation',
        title: 'Issue a book',
        description: 'Lend a copy to a registered student. The due date follows the library lending rules.'
      })}
      ${passwordNotice()}
      <div class="layout-split">
        ${ui.card({
          title: 'New loan',
          body: html`
            <form data-form="loan-create" novalidate>
              <div class="field-grid">
                ${ui.selectField({
                  name: 'memberId', label: 'Student', required: true, full: true,
                  placeholder: 'Select a student',
                  options: members.map(function (member) {
                    return { value: member.id, label: member.name + ' — ' + member.code };
                  })
                })}
                ${ui.selectField({
                  name: 'copyId', label: 'Copy', required: true, full: true,
                  placeholder: 'Select an available copy',
                  options: available.map(function (copy) {
                    var book = query.book(copy.bookId);
                    return { value: copy.id, label: (book ? book.title : 'Unknown title') + ' — ' + copy.accession };
                  })
                })}
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn--primary" ${LMS.raw(available.length && members.length ? '' : 'disabled')}>
                  ${ui.icon('issue', 16)} Issue book
                </button>
              </div>
              ${!available.length ? html`<p class="form-note">Every copy is currently on loan.</p>` : ''}
              ${!members.length ? html`<p class="form-note">No active students are registered.</p>` : ''}
            </form>`
        })}
        ${ui.card({
          title: 'Lending rules',
          body: html`
            <dl class="summary-list">
              <div><dt>Loan period</dt><dd>${settings().loanDays} days</dd></div>
              <div><dt>Due date</dt><dd>${dates.format(dates.addDays(dates.today(), settings().loanDays))}</dd></div>
              <div><dt>Default limit</dt><dd>${settings().maxLoans} books per student</dd></div>
              <div><dt>Overdue fine</dt><dd>${money(settings().finePerDay)} per day</dd></div>
              <div><dt>Borrowing blocked above</dt><dd>${money(settings().fineBlockLimit)} in unpaid fines</dd></div>
            </dl>
            <p class="form-note">A student's own reservation for the title is closed automatically when the book is issued to them.</p>`
        })}
      </div>`;
  }

  /* ==========================================================================
   * Return
   * ========================================================================== */

  function returns() {
    var term = filters.returns;
    var loans = query.activeLoans().filter(function (loan) {
      if (!term) return true;
      var book = query.bookOfCopy(loan.copyId);
      var copy = query.copy(loan.copyId);
      var member = query.member(loan.memberId);
      return [book && book.title, copy && copy.accession, member && member.name, member && member.code]
        .some(function (field) { return matches(field, term); });
    });

    var rows = loans.map(function (loan) {
      var copy = query.copy(loan.copyId);
      var book = copy ? query.book(copy.bookId) : null;
      var member = query.member(loan.memberId);
      var overdueDays = dates.daysOverdue(loan.dueDate);
      return [
        html`<strong>${book ? book.title : 'Withdrawn title'}</strong>
             <span class="cell-sub cell-mono">${copy ? copy.accession : '—'}</span>`,
        html`<strong>${member ? member.name : 'Removed student'}</strong>
             <span class="cell-sub cell-mono">${member ? member.code : '—'}</span>`,
        dates.format(loan.issueDate),
        html`${dates.format(loan.dueDate)}<span class="cell-sub">${loanStatusBadge(loan)}</span>`,
        overdueDays > 0
          ? html`<span class="amount amount--due">${money(overdueDays * settings().finePerDay)}</span>`
          : html`<span class="cell-muted">—</span>`,
        html`
          <div class="row-actions">
            <button class="btn btn--small btn--primary" data-action="loan-return" data-id="${loan.id}">Return</button>
            <button class="btn btn--small btn--ghost" data-action="loan-renew" data-id="${loan.id}">
              Renew${loan.renewals ? ' (' + loan.renewals + '/' + settings().maxRenewals + ')' : ''}
            </button>
          </div>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Circulation',
        title: 'Return a book',
        description: 'Close a loan and record any overdue fine automatically.'
      })}
      ${passwordNotice()}
      ${ui.card({
        body: html`
          <div class="toolbar">
            <p class="toolbar__count"><strong>${loans.length}</strong> books on loan</p>
            ${searchBar('returns', 'Search by book, accession or student')}
          </div>
          ${ui.dataTable({
            columns: [
              { label: 'Book' }, { label: 'Student' }, { label: 'Issued' },
              { label: 'Due' }, { label: 'Fine due', align: 'right' }, { label: 'Actions' }
            ],
            rows: rows,
            empty: { icon: 'check', title: term ? 'No loans match that search.' : 'Nothing is on loan right now.' }
          })}`
      })}`;
  }

  /* ==========================================================================
   * Reservations
   * ========================================================================== */

  function reservations() {
    var isMember = role() === 'member';
    var list = db().reservations.filter(function (item) {
      return isMember ? item.memberId === me().id : true;
    }).slice().sort(function (a, b) { return b.id - a.id; });

    var rows = list.map(function (reservation) {
      var book = query.book(reservation.bookId);
      var member = query.member(reservation.memberId);
      var available = book ? query.availableCopiesOf(book.id).length : 0;
      var tone = { pending: 'info', fulfilled: 'success', cancelled: 'neutral' }[reservation.status] || 'neutral';

      var cells = [
        html`<strong>${book ? book.title : 'Withdrawn title'}</strong>
             <span class="cell-sub">${book ? (book.author || 'Unknown author') : '—'}</span>`
      ];
      if (!isMember) {
        cells.push(html`<strong>${member ? member.name : 'Removed student'}</strong>
                        <span class="cell-sub cell-mono">${member ? member.code : '—'}</span>`);
      }
      cells.push(dates.format(reservation.date));
      cells.push(ui.badge(reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1), tone));
      cells.push(reservation.status === 'pending'
        ? (available > 0 ? ui.badge('Copy on shelf', 'success') : html`<span class="cell-muted">Waiting</span>`)
        : html`<span class="cell-muted">—</span>`);
      cells.push(reservation.status === 'pending'
        ? html`<button class="btn btn--small btn--ghost" data-action="reservation-cancel" data-id="${reservation.id}">Cancel</button>`
        : html`<span class="cell-muted">—</span>`);

      return cells;
    });

    var columns = [{ label: 'Book' }];
    if (!isMember) columns.push({ label: 'Student' });
    columns.push({ label: 'Placed' }, { label: 'Status' }, { label: 'Copy' }, { label: 'Actions' });

    return html`
      ${ui.pageHeader({
        eyebrow: isMember ? 'My library' : 'Circulation',
        title: isMember ? 'My reservations' : 'Reservations',
        description: isMember
          ? 'Titles you are waiting for. A reservation closes when the book is issued to you.'
          : 'Requests placed by students when every copy of a title is on loan.'
      })}
      ${passwordNotice()}
      ${ui.card({
        title: 'Requests',
        meta: list.filter(function (item) { return item.status === 'pending'; }).length + ' waiting',
        body: ui.dataTable({
          columns: columns,
          rows: rows,
          empty: {
            icon: 'reservations',
            title: 'No reservations yet.',
            description: isMember
              ? 'You can reserve a title from the catalogue when all its copies are out.'
              : 'Students can reserve a title from the catalogue when all copies are out.'
          }
        })
      })}`;
  }

  /* ==========================================================================
   * Fines
   * ========================================================================== */

  function fines() {
    var term = filters.fines;
    var list = db().fines.slice().sort(function (a, b) { return b.id - a.id; }).filter(function (fine) {
      if (!term) return true;
      var member = query.member(fine.memberId);
      return [member && member.name, member && member.code, fine.reason]
        .some(function (field) { return matches(field, term); });
    });

    var totalOutstanding = db().fines.reduce(function (total, fine) {
      return total + (fine.amount - fine.paid);
    }, 0);
    var totalCollected = db().fines.reduce(function (total, fine) { return total + fine.paid; }, 0);

    var rows = list.map(function (fine) {
      var member = query.member(fine.memberId);
      var book = fine.loanId ? bookForLoan(fine.loanId) : null;
      var outstanding = fine.amount - fine.paid;
      var tone = { paid: 'success', partial: 'warning', unpaid: 'danger' }[fine.status] || 'neutral';
      return [
        html`<strong>${member ? member.name : 'Removed student'}</strong>
             <span class="cell-sub cell-mono">${member ? member.code : '—'}</span>`,
        html`${book ? book.title : 'Withdrawn title'}<span class="cell-sub">${fine.reason}</span>`,
        dates.format(fine.createdOn),
        html`<span class="amount">${money(fine.amount)}</span>`,
        html`<span class="amount">${money(fine.paid)}</span>`,
        html`<span class="amount ${outstanding > 0 ? 'amount--due' : ''}">${money(outstanding)}</span>`,
        ui.badge(fine.status.charAt(0).toUpperCase() + fine.status.slice(1), tone),
        outstanding > 0
          ? html`<button class="btn btn--small btn--primary" data-action="fine-pay" data-id="${fine.id}">Record payment</button>`
          : html`<span class="cell-muted">Settled</span>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Finance',
        title: 'Fines',
        description: 'Overdue charges raised on return, and the payments collected against them.'
      })}
      ${passwordNotice()}
      ${ui.statGrid([
        { label: 'Outstanding', value: money(totalOutstanding), icon: 'payments', tone: totalOutstanding > 0 ? 'danger' : 'default', note: 'Still to collect' },
        { label: 'Collected', value: money(totalCollected), icon: 'check', tone: 'success', note: 'Payments recorded' },
        { label: 'Open fines', value: db().fines.filter(function (f) { return f.status !== 'paid'; }).length, icon: 'alert', note: 'Not yet settled' },
        { label: 'Daily rate', value: money(settings().finePerDay), icon: 'clock', note: 'Per overdue day' }
      ])}
      ${ui.card({
        body: html`
          <div class="toolbar">
            <p class="toolbar__count"><strong>${list.length}</strong> fine records</p>
            ${searchBar('fines', 'Search by student or reason')}
          </div>
          ${ui.dataTable({
            columns: [
              { label: 'Student' }, { label: 'Book' }, { label: 'Raised' },
              { label: 'Amount', align: 'right' }, { label: 'Paid', align: 'right' },
              { label: 'Outstanding', align: 'right' }, { label: 'Status' }, { label: 'Action' }
            ],
            rows: rows,
            empty: { icon: 'check', title: term ? 'No fines match that search.' : 'No fines have been raised.' }
          })}`
      })}`;
  }

  function bookForLoan(loanId) {
    var loan = db().loans.find(function (item) { return item.id === loanId; });
    return loan ? query.bookOfCopy(loan.copyId) : null;
  }

  function paymentForm(fine) {
    var outstanding = fine.amount - fine.paid;
    var member = query.member(fine.memberId);
    return html`
      <dl class="detail-list">
        <div><dt>Student</dt><dd>${member ? member.name : 'Removed student'}</dd></div>
        <div><dt>Reason</dt><dd>${fine.reason}</dd></div>
        <div><dt>Total fine</dt><dd>${money(fine.amount)}</dd></div>
        <div><dt>Already paid</dt><dd>${money(fine.paid)}</dd></div>
        <div><dt>Outstanding</dt><dd><strong>${money(outstanding)}</strong></dd></div>
      </dl>
      ${fine.payments.length ? html`
        <h3 class="detail-heading">Payment history</h3>
        <ul class="timeline">
          ${fine.payments.map(function (payment) {
            return html`<li><span>${dates.format(payment.date)}</span><strong>${money(payment.amount)}</strong></li>`;
          })}
        </ul>` : ''}
      <form data-form="fine-pay" class="inline-form" novalidate>
        <input type="hidden" name="fineId" value="${fine.id}">
        <div class="field-grid">
          ${ui.textField({
            name: 'amount', label: 'Amount received', type: 'number', required: true,
            value: outstanding, min: 0.01, max: outstanding, step: '0.01',
            hint: 'Maximum ' + money(outstanding) + '. Partial payments are allowed.'
          })}
        </div>
        ${ui.formActions({ submitLabel: 'Record payment' })}
      </form>`;
  }

  /* ==========================================================================
   * Reports
   * ========================================================================== */

  function reports() {
    var data = db();
    var active = query.activeLoans();
    var overdue = query.overdueLoans();
    var returned = data.loans.filter(function (loan) { return loan.status === 'returned'; });

    var overdueRows = overdue
      .slice()
      .sort(function (a, b) { return dates.diffDays(b.dueDate, a.dueDate); })
      .map(function (loan) {
        var book = query.bookOfCopy(loan.copyId);
        var member = query.member(loan.memberId);
        var days = dates.daysOverdue(loan.dueDate);
        return [
          book ? book.title : 'Withdrawn title',
          member ? member.name : 'Removed student',
          dates.format(loan.dueDate),
          ui.badge(days + (days === 1 ? ' day' : ' days'), 'danger'),
          html`<span class="amount amount--due">${money(days * settings().finePerDay)}</span>`
        ];
      });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Insights',
        title: 'Reports',
        description: 'Circulation totals, the most borrowed titles and everything currently overdue.'
      })}
      ${passwordNotice()}
      ${ui.statGrid([
        { label: 'Total loans', value: data.loans.length, icon: 'reports', note: 'All time' },
        { label: 'On loan now', value: active.length, icon: 'issue', tone: 'info', note: 'Not yet returned' },
        { label: 'Overdue', value: overdue.length, icon: 'alert', tone: overdue.length ? 'danger' : 'default', note: 'Past the due date' },
        { label: 'Returned', value: returned.length, icon: 'check', tone: 'success', note: 'Completed loans' }
      ])}
      <div class="layout-split layout-split--wide-left">
        ${ui.card({
          title: 'Overdue books',
          meta: overdue.length + ' outstanding',
          body: ui.dataTable({
            columns: [
              { label: 'Book' }, { label: 'Student' }, { label: 'Was due' },
              { label: 'Overdue by' }, { label: 'Fine accrued', align: 'right' }
            ],
            rows: overdueRows,
            empty: { icon: 'check', title: 'Nothing is overdue.', description: 'Every book on loan is still within its lending period.' }
          })
        })}
        ${ui.card({
          title: 'Most borrowed',
          meta: 'By total loans',
          body: mostBorrowedList()
        })}
      </div>`;
  }

  function mostBorrowedList() {
    var counts = new Map();
    db().loans.forEach(function (loan) {
      var book = query.bookOfCopy(loan.copyId);
      if (!book) return;
      counts.set(book.id, (counts.get(book.id) || 0) + 1);
    });

    var ranked = Array.from(counts.entries())
      .map(function (entry) { return { book: query.book(entry[0]), count: entry[1] }; })
      .filter(function (entry) { return entry.book; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 6);

    if (!ranked.length) {
      return ui.emptyState({ icon: 'books', title: 'No borrowing history yet.' });
    }

    var highest = ranked[0].count;
    return html`
      <ul class="rank-list">
        ${ranked.map(function (entry) {
          return html`
            <li class="rank">
              <div class="rank__label">
                <span>${entry.book.title}</span>
                <strong>${entry.count}</strong>
              </div>
              <div class="rank__bar"><span style="width:${Math.round((entry.count / highest) * 100)}%"></span></div>
            </li>`;
        })}
      </ul>`;
  }

  /* ==========================================================================
   * Lending rules (administrator only)
   * ========================================================================== */

  function settingsPage() {
    var current = settings();
    return html`
      ${ui.pageHeader({
        eyebrow: 'Administration',
        title: 'Lending rules',
        description: 'System-wide defaults applied to new loans, fines and student registrations.'
      })}
      ${passwordNotice()}
      <div class="layout-split">
        ${ui.card({
          title: 'Circulation policy',
          body: html`
            <form data-form="settings-save" novalidate>
              <div class="field-grid">
                ${ui.textField({ name: 'loanDays', label: 'Loan period (days)', type: 'number', value: current.loanDays, min: 1, max: 120, required: true })}
                ${ui.textField({ name: 'finePerDay', label: 'Fine per overdue day', type: 'number', value: current.finePerDay, min: 0, max: 1000, step: '0.5', required: true })}
                ${ui.textField({ name: 'maxLoans', label: 'Default borrowing limit', type: 'number', value: current.maxLoans, min: 1, max: 20, required: true })}
                ${ui.textField({ name: 'maxRenewals', label: 'Renewals allowed per loan', type: 'number', value: current.maxRenewals, min: 0, max: 5, required: true })}
                ${ui.textField({
                  name: 'fineBlockLimit', label: 'Block borrowing above', type: 'number',
                  value: current.fineBlockLimit, min: 0, max: 100000, required: true,
                  hint: 'Unpaid fines above this amount prevent new loans.'
                })}
              </div>
              ${ui.formActions({ submitLabel: 'Save rules', cancel: false })}
            </form>`
        })}
        ${ui.card({
          title: 'Data',
          body: html`
            <p class="detail-prose">
              Library ASBA stores its records in this browser only. Clearing site data, or opening the
              system on another device, starts from an empty catalogue.
            </p>
            <div class="action-stack">
              <button class="btn btn--ghost" data-action="data-export">Download a backup</button>
              <button class="btn btn--danger-quiet" data-action="data-reset">Reset to demonstration data</button>
            </div>`
        })}
      </div>`;
  }

  /* ==========================================================================
   * Member catalogue
   * ========================================================================== */

  function catalog() {
    var term = filters.catalog;
    var list = db().books.filter(function (book) {
      return !term || [book.title, book.author, book.isbn, book.category, book.publisher]
        .some(function (field) { return matches(field, term); });
    });

    var rows = list.map(function (book) {
      var copies = query.copiesOf(book.id);
      var available = query.availableCopiesOf(book.id);
      var reserved = query.reservationFor(book.id, me().id);
      var shelves = Array.from(new Set(available.map(function (copy) { return copy.shelf; }).filter(Boolean)));

      return [
        html`<strong>${book.title}</strong><span class="cell-sub">${book.author || 'Unknown author'}</span>`,
        book.category || '—',
        html`<span class="cell-mono">${book.isbn || '—'}</span>`,
        available.length
          ? html`${ui.badge(available.length + ' available', 'success')}
                 ${shelves.length ? html`<span class="cell-sub">Shelf ${shelves.join(', ')}</span>` : ''}`
          : html`${ui.badge('All ' + copies.length + ' out', 'danger')}
                 <span class="cell-sub">Reserve to join the queue</span>`,
        html`
          <div class="row-actions">
            <button class="btn btn--small btn--ghost" data-action="catalog-view" data-id="${book.id}">Details</button>
            ${available.length
              ? html`<span class="cell-muted">Ask at the desk</span>`
              : reserved
                ? html`<button class="btn btn--small btn--ghost" data-action="reservation-cancel" data-id="${reserved.id}">Cancel reservation</button>`
                : html`<button class="btn btn--small btn--primary" data-action="reservation-create" data-id="${book.id}">Reserve</button>`}
          </div>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'Catalogue',
        title: 'Search the library',
        description: 'Find a title, check whether a copy is on the shelf, and reserve anything that is out.'
      })}
      ${passwordNotice()}
      ${ui.card({
        body: html`
          <div class="toolbar">
            <p class="toolbar__count"><strong>${list.length}</strong> of ${db().books.length} titles</p>
            ${searchBar('catalog', 'Search by title, author, ISBN or category')}
          </div>
          ${ui.dataTable({
            columns: [
              { label: 'Title' }, { label: 'Category' }, { label: 'ISBN' },
              { label: 'Availability' }, { label: 'Actions' }
            ],
            rows: rows,
            empty: { icon: 'search', title: term ? 'Nothing matches that search.' : 'The catalogue is empty.' }
          })}`
      })}`;
  }

  function myLoans() {
    var member = me();
    var active = query.loansOfMember(member.id, 'issued');
    var history = query.loansOfMember(member.id, 'returned')
      .slice()
      .sort(function (a, b) { return b.id - a.id; })
      .slice(0, 15);

    var historyRows = history.map(function (loan) {
      var book = query.bookOfCopy(loan.copyId);
      var fine = db().fines.find(function (item) { return item.loanId === loan.id; });
      return [
        book ? book.title : 'Withdrawn title',
        dates.format(loan.issueDate),
        dates.format(loan.returnDate),
        fine ? html`<span class="amount ${fine.status === 'paid' ? '' : 'amount--due'}">${money(fine.amount)}</span>` : html`<span class="cell-muted">None</span>`
      ];
    });

    return html`
      ${ui.pageHeader({
        eyebrow: 'My library',
        title: 'My loans',
        description: 'Books you have out at the moment, and what you have returned recently.'
      })}
      ${passwordNotice()}
      ${ui.card({
        title: 'On loan',
        meta: active.length + ' of ' + member.maxLoans + ' allowed',
        body: memberLoanTable(active)
      })}
      ${ui.card({
        title: 'Recently returned',
        body: ui.dataTable({
          columns: [{ label: 'Book' }, { label: 'Issued' }, { label: 'Returned' }, { label: 'Fine' }],
          rows: historyRows,
          empty: { icon: 'clock', title: 'No returns recorded yet.' }
        })
      })}`;
  }

  /* ==========================================================================
   * Profile
   * ========================================================================== */

  function profile() {
    var account = me();
    var isMember = role() === 'member';

    return html`
      ${ui.pageHeader({
        eyebrow: 'Account',
        title: 'My profile',
        description: 'Update your personal details and change your password.'
      })}
      ${passwordNotice()}
      <div class="profile">
        <aside class="profile__summary">
          <p class="profile__avatar" aria-hidden="true">${account.name.charAt(0).toUpperCase()}</p>
          <h2>${account.name}</h2>
          <p class="profile__role">${LMS.roleLabel(role())}</p>
          <p class="profile__email">${account.email}</p>
          <div class="profile__pills">
            ${account.code ? html`<span class="pill">${account.code}</span>` : ''}
            <span class="pill">${account.status === 'active' ? 'Active' : 'Inactive'}</span>
          </div>
          <dl class="profile__facts">
            <div><dt>Member since</dt><dd>${dates.format(account.createdOn)}</dd></div>
            ${isMember ? html`<div><dt>Borrowing limit</dt><dd>${account.maxLoans} books</dd></div>` : ''}
            ${isMember ? html`<div><dt>Outstanding fines</dt><dd>${money(query.outstandingFor(account.id))}</dd></div>` : ''}
          </dl>
        </aside>

        <div class="profile__forms">
          ${ui.card({
            title: 'Personal details',
            meta: 'Email and role are fixed',
            body: html`
              <form data-form="profile-save" novalidate>
                <div class="field-grid">
                  ${ui.readonlyField({ name: 'accountEmail', label: 'Email address', value: account.email, hint: 'Linked to your sign-in and cannot be changed here.' })}
                  ${ui.readonlyField({ name: 'accountRole', label: 'Role', value: LMS.roleLabel(role()), hint: 'Only an administrator can change roles.' })}
                  ${ui.textField({ name: 'name', label: 'Full name', value: account.name, required: true, maxlength: 80, autocomplete: 'name' })}
                  ${ui.textField({ name: 'phone', label: 'Phone number', value: account.phone, maxlength: 20, placeholder: '+91 98765 43210', autocomplete: 'tel' })}
                  ${ui.textField({ name: 'department', label: 'Department', value: account.department, maxlength: 80 })}
                  ${isMember
                    ? ui.textField({ name: 'course', label: 'Course', value: account.course, maxlength: 80 })
                    : ui.textField({ name: 'designation', label: 'Designation', value: account.designation, maxlength: 80 })}
                  ${isMember
                    ? ui.textField({ name: 'semester', label: 'Semester', value: account.semester, maxlength: 40 })
                    : ''}
                  ${ui.textArea({
                    name: isMember ? 'notes' : 'bio',
                    label: isMember ? 'Additional details' : 'About',
                    value: isMember ? account.notes : account.bio,
                    maxlength: 300
                  })}
                </div>
                ${ui.formActions({ submitLabel: 'Save details', cancelAction: 'go-home', cancelLabel: 'Discard' })}
              </form>`
          })}

          ${ui.card({
            title: 'Password',
            meta: 'Signed in on this device',
            body: html`
              <form data-form="password-change" novalidate>
                <div class="field-grid">
                  ${ui.textField({ name: 'current', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' })}
                  ${ui.textField({ name: 'next', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 6 characters.' })}
                  ${ui.textField({ name: 'confirm', label: 'Confirm new password', type: 'password', required: true, autocomplete: 'new-password' })}
                </div>
                ${ui.formActions({ submitLabel: 'Change password', cancel: false })}
              </form>`
          })}
        </div>
      </div>`;
  }

  /* ==========================================================================
   * Actions
   * ========================================================================== */

  var actions = {
    'go': function (dataset) {
      LMS.app.navigate(dataset.page);
    },

    'go-home': function () {
      LMS.app.navigate('home');
    },

    'close-modal': function () {
      ui.modal.close();
    },

    /* --- Librarians ------------------------------------------------------ */

    'librarian-new': function () {
      ui.modal.open({
        title: 'Add a librarian',
        description: 'The account can sign in as soon as it is created.',
        body: librarianForm()
      });
    },

    'librarian-toggle': function (dataset) {
      var user = db().users.find(function (item) { return item.id === Number(dataset.id); });
      if (!user || user.role !== 'librarian') return;

      ui.confirm({
        title: user.status === 'active' ? 'Deactivate this account?' : 'Reactivate this account?',
        message: user.status === 'active'
          ? user.name + ' will no longer be able to sign in. Their records are kept.'
          : user.name + ' will be able to sign in again.',
        confirmLabel: user.status === 'active' ? 'Deactivate' : 'Activate',
        tone: user.status === 'active' ? 'danger' : 'default'
      }).then(function (confirmed) {
        if (!confirmed) return;
        user.status = user.status === 'active' ? 'inactive' : 'active';
        LMS.store.save();
        ui.toast(user.name + ' is now ' + (user.status === 'active' ? 'active' : 'deactivated') + '.', 'success');
        LMS.app.refresh();
      });
    },

    'librarian-reset': function (dataset) {
      var user = db().users.find(function (item) { return item.id === Number(dataset.id); });
      if (!user) return;
      resetPasswordFor(user, 'Librarian');
    },

    /* --- Students -------------------------------------------------------- */

    'student-new': function () {
      ui.modal.open({
        title: 'Register a student',
        description: 'A member code is assigned automatically.',
        body: studentForm()
      });
    },

    'student-view': function (dataset) {
      var member = query.member(Number(dataset.id));
      if (!member) return;
      ui.modal.open({ title: member.name, description: member.code, body: studentDetail(member), size: 'wide' });
    },

    'student-toggle': function (dataset) {
      var member = query.member(Number(dataset.id));
      if (!member) return;

      var suspending = member.status === 'active';
      var onLoan = query.loansOfMember(member.id, 'issued').length;

      ui.confirm({
        title: suspending ? 'Suspend this student?' : 'Reinstate this student?',
        message: suspending
          ? member.name + ' will not be able to borrow or sign in.' +
            (onLoan ? ' They still have ' + onLoan + ' book(s) on loan.' : '')
          : member.name + ' will be able to borrow and sign in again.',
        confirmLabel: suspending ? 'Suspend' : 'Reinstate',
        tone: suspending ? 'danger' : 'default'
      }).then(function (confirmed) {
        if (!confirmed) return;
        member.status = suspending ? 'inactive' : 'active';
        LMS.store.save();
        ui.toast(member.name + ' is now ' + (member.status === 'active' ? 'active' : 'suspended') + '.', 'success');
        LMS.app.refresh();
      });
    },

    'student-reset': function (dataset) {
      var member = query.member(Number(dataset.id));
      if (!member) return;
      resetPasswordFor(member, 'Student');
    },

    /* --- Books ----------------------------------------------------------- */

    'book-new': function () {
      ui.modal.open({
        title: 'Add a book',
        description: 'Record the title once, then add as many physical copies as the library holds.',
        body: bookForm()
      });
    },

    'book-view': function (dataset) {
      var book = query.book(Number(dataset.id));
      if (!book) return;
      ui.modal.open({ title: book.title, description: book.author, body: bookDetail(book) });
    },

    'catalog-view': function (dataset) {
      actions['book-view'](dataset);
    },

    'book-copies': function (dataset) {
      var book = query.book(Number(dataset.id));
      if (!book) return;
      ui.modal.open({ title: 'Copies of ' + book.title, description: book.isbn || '', body: copiesDialog(book), size: 'wide' });
    },

    'book-remove': function (dataset) {
      var book = query.book(Number(dataset.id));
      if (!book) return;

      var copies = query.copiesOf(book.id);
      var copyIds = copies.map(function (copy) { return copy.id; });
      var loans = db().loans.filter(function (loan) { return copyIds.indexOf(loan.copyId) !== -1; });
      var onLoan = loans.filter(function (loan) { return loan.status === 'issued'; });

      if (onLoan.length) {
        ui.toast('This title has ' + onLoan.length + ' copy(ies) on loan. Take them back first.', 'error');
        return;
      }

      var loanIds = loans.map(function (loan) { return loan.id; });
      var relatedFines = db().fines.filter(function (fine) { return loanIds.indexOf(fine.loanId) !== -1; });
      var unpaid = relatedFines.filter(function (fine) { return fine.status !== 'paid'; });
      var relatedReservations = db().reservations.filter(function (item) { return item.bookId === book.id; });

      if (unpaid.length) {
        ui.toast('Settle the ' + unpaid.length + ' unpaid fine(s) for this title before removing it.', 'error');
        return;
      }

      ui.confirm({
        title: 'Remove “' + book.title + '”?',
        message: 'This deletes the title, its ' + copies.length + ' copy record(s), ' +
                 loans.length + ' loan record(s), ' + relatedFines.length + ' settled fine(s) and ' +
                 relatedReservations.length + ' reservation(s). This cannot be undone.',
        confirmLabel: 'Remove permanently',
        tone: 'danger'
      }).then(function (confirmed) {
        if (!confirmed) return;

        var data = db();
        data.books = data.books.filter(function (item) { return item.id !== book.id; });
        data.copies = data.copies.filter(function (copy) { return copy.bookId !== book.id; });
        data.loans = data.loans.filter(function (loan) { return loanIds.indexOf(loan.id) === -1; });
        data.fines = data.fines.filter(function (fine) { return loanIds.indexOf(fine.loanId) === -1; });
        data.reservations = data.reservations.filter(function (item) { return item.bookId !== book.id; });

        LMS.store.save();
        ui.toast('“' + book.title + '” was removed from the catalogue.', 'success');
        LMS.app.refresh();
      });
    },

    'copy-remove': function (dataset) {
      var copy = query.copy(Number(dataset.id));
      if (!copy) return;
      var book = query.book(copy.bookId);

      if (copy.status === 'issued') {
        ui.toast('This copy is on loan and cannot be removed.', 'error');
        return;
      }

      ui.confirm({
        title: 'Remove copy ' + copy.accession + '?',
        message: 'The copy record is deleted. Past loans of this copy are kept for the history.',
        confirmLabel: 'Remove copy',
        tone: 'danger'
      }).then(function (confirmed) {
        if (!confirmed) return;
        db().copies = db().copies.filter(function (item) { return item.id !== copy.id; });
        LMS.store.save();
        ui.toast('Copy ' + copy.accession + ' removed.', 'success');
        if (book) actions['book-copies']({ id: String(book.id) });
        LMS.app.refresh();
      });
    },

    /* --- Circulation ----------------------------------------------------- */

    'loan-return': function (dataset) {
      var loan = db().loans.find(function (item) { return item.id === Number(dataset.id); });
      if (!loan || loan.status !== 'issued') return;

      var copy = query.copy(loan.copyId);
      var member = query.member(loan.memberId);
      var overdueDays = dates.daysOverdue(loan.dueDate);
      var fineAmount = overdueDays * settings().finePerDay;

      ui.confirm({
        title: 'Record this return?',
        message: overdueDays > 0
          ? 'The book is ' + overdueDays + ' day(s) overdue. A fine of ' + money(fineAmount) +
            ' will be raised against ' + (member ? member.name : 'the student') + '.'
          : 'The book is being returned on time. No fine will be raised.',
        confirmLabel: 'Confirm return'
      }).then(function (confirmed) {
        if (!confirmed) return;

        loan.status = 'returned';
        loan.returnDate = dates.today();
        if (copy && copy.status === 'issued') copy.status = 'available';

        if (fineAmount > 0) {
          db().fines.push({
            id: LMS.store.nextId('fine'),
            loanId: loan.id,
            memberId: loan.memberId,
            amount: fineAmount,
            paid: 0,
            status: 'unpaid',
            reason: overdueDays + ' day(s) overdue',
            createdOn: dates.today(),
            payments: []
          });
        }

        LMS.store.save();
        ui.toast(fineAmount > 0
          ? 'Returned. A fine of ' + money(fineAmount) + ' was raised.'
          : 'Returned on time. Nothing to pay.', 'success');
        LMS.app.refresh();
      });
    },

    'loan-renew': function (dataset) {
      var loan = db().loans.find(function (item) { return item.id === Number(dataset.id); });
      if (!loan || loan.status !== 'issued') return;

      if (loan.renewals >= settings().maxRenewals) {
        ui.toast('This loan has already been renewed ' + loan.renewals + ' time(s), the maximum allowed.', 'error');
        return;
      }
      if (dates.daysOverdue(loan.dueDate) > 0) {
        ui.toast('An overdue loan cannot be renewed. Take the book back and issue it again.', 'error');
        return;
      }

      var copy = query.copy(loan.copyId);
      var waiting = copy ? db().reservations.filter(function (item) {
        return item.bookId === copy.bookId && item.status === 'pending' && item.memberId !== loan.memberId;
      }).length : 0;

      if (waiting) {
        ui.toast(waiting + ' student(s) are waiting for this title, so it cannot be renewed.', 'error');
        return;
      }

      loan.dueDate = dates.addDays(loan.dueDate, settings().loanDays);
      loan.renewals += 1;
      LMS.store.save();
      ui.toast('Renewed. Now due ' + dates.format(loan.dueDate) + '.', 'success');
      LMS.app.refresh();
    },

    /* --- Reservations ---------------------------------------------------- */

    'reservation-create': function (dataset) {
      var book = query.book(Number(dataset.id));
      if (!book) return;

      if (query.availableCopiesOf(book.id).length) {
        ui.toast('A copy is on the shelf — no reservation needed.', 'info');
        return;
      }
      if (query.reservationFor(book.id, me().id)) {
        ui.toast('You have already reserved this title.', 'info');
        return;
      }

      db().reservations.push({
        id: LMS.store.nextId('reservation'),
        bookId: book.id,
        memberId: me().id,
        date: dates.today(),
        status: 'pending'
      });
      LMS.store.save();
      ui.toast('Reserved “' + book.title + '”. You will be notified at the desk when a copy is free.', 'success');
      LMS.app.refresh();
    },

    'reservation-cancel': function (dataset) {
      var reservation = db().reservations.find(function (item) { return item.id === Number(dataset.id); });
      if (!reservation || reservation.status !== 'pending') return;
      if (role() === 'member' && reservation.memberId !== me().id) return;

      var book = query.book(reservation.bookId);

      ui.confirm({
        title: 'Cancel this reservation?',
        message: 'The request for “' + (book ? book.title : 'this title') + '” will be withdrawn.',
        confirmLabel: 'Cancel reservation',
        tone: 'danger'
      }).then(function (confirmed) {
        if (!confirmed) return;
        reservation.status = 'cancelled';
        LMS.store.save();
        ui.toast('Reservation cancelled.', 'success');
        LMS.app.refresh();
      });
    },

    /* --- Fines ----------------------------------------------------------- */

    'fine-pay': function (dataset) {
      var fine = db().fines.find(function (item) { return item.id === Number(dataset.id); });
      if (!fine || fine.status === 'paid') return;
      ui.modal.open({ title: 'Record a payment', body: paymentForm(fine) });
    },

    /* --- Data ------------------------------------------------------------ */

    'data-export': function () {
      var blob = new Blob([JSON.stringify(db(), null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'library-asba-backup-' + dates.today() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      ui.toast('Backup downloaded.', 'success');
    },

    'data-reset': function () {
      ui.confirm({
        title: 'Reset all library data?',
        message: 'Every book, student, loan and fine recorded in this browser is deleted and replaced with the demonstration data. This cannot be undone.',
        confirmLabel: 'Delete everything',
        tone: 'danger'
      }).then(function (confirmed) {
        if (!confirmed) return;
        LMS.store.reset();
        window.location.href = 'index.html';
      });
    }
  };

  function resetPasswordFor(account, label) {
    var temporary = LMS.auth.temporaryPassword();
    ui.confirm({
      title: 'Issue a temporary password?',
      message: 'A new password will be generated for ' + account.name +
               '. Their current password stops working immediately.',
      confirmLabel: 'Issue password'
    }).then(function (confirmed) {
      if (!confirmed) return;
      return LMS.auth.setPassword(account, temporary).then(function () {
        account.mustChangePassword = true;
        LMS.store.save();
        ui.modal.open({
          title: 'Temporary password issued',
          description: label + ': ' + account.name,
          body: html`
            <p class="detail-prose">Give this password to ${account.name}. It is shown once — it is stored hashed and cannot be read back.</p>
            <p class="credential">${temporary}</p>
            <p class="detail-prose cell-muted">They will be asked to choose their own password after signing in.</p>
            <div class="form-actions">
              <button type="button" class="btn btn--primary" data-action="close-modal">Done</button>
            </div>`
        });
        LMS.app.refresh();
      });
    });
  }

  /* ==========================================================================
   * Form handlers
   * ========================================================================== */

  var forms = {
    'librarian-create': function (form) {
      var values = ui.formValues(form);
      var email = LMS.normaliseEmail(values.email);

      if (!LMS.validate.name(values.name)) return ui.toast('Enter the librarian’s full name.', 'error');
      if (!LMS.validate.email(email)) return ui.toast('Enter a valid email address.', 'error');
      if (query.accountByEmail(email)) return ui.toast('An account already uses that email address.', 'error');
      if (!LMS.validate.phone(values.phone)) return ui.toast('Enter a valid phone number, or leave it blank.', 'error');
      if (!LMS.validate.password(values.password)) return ui.toast('The temporary password needs at least 6 characters.', 'error');

      var user = {
        id: LMS.store.nextId('user'),
        name: values.name,
        email: email,
        role: 'librarian',
        status: 'active',
        department: values.department,
        designation: values.designation,
        phone: values.phone,
        bio: '',
        salt: null,
        passwordHash: null,
        mustChangePassword: true,
        createdOn: dates.today()
      };

      return LMS.auth.setPassword(user, values.password).then(function () {
        db().users.push(user);
        LMS.store.save();
        ui.modal.close();
        ui.toast(user.name + ' can now sign in with the password you set.', 'success');
        LMS.app.refresh();
      });
    },

    'student-create': function (form) {
      var values = ui.formValues(form);
      var email = LMS.normaliseEmail(values.email);
      var limit = Number(values.maxLoans);

      if (!LMS.validate.name(values.name)) return ui.toast('Enter the student’s full name.', 'error');
      if (!LMS.validate.email(email)) return ui.toast('Enter a valid email address.', 'error');
      if (query.accountByEmail(email)) return ui.toast('An account already uses that email address.', 'error');
      if (!LMS.validate.phone(values.phone)) return ui.toast('Enter a valid phone number, or leave it blank.', 'error');
      if (!(limit >= 1 && limit <= 20)) return ui.toast('The borrowing limit must be between 1 and 20.', 'error');
      if (!LMS.validate.password(values.password)) return ui.toast('The temporary password needs at least 6 characters.', 'error');

      var id = LMS.store.nextId('member');
      var member = {
        id: id,
        code: 'ST' + String(id).padStart(5, '0'),
        name: values.name,
        email: email,
        role: 'member',
        status: 'active',
        department: values.department,
        course: values.course,
        semester: values.semester,
        phone: values.phone,
        notes: '',
        maxLoans: limit,
        salt: null,
        passwordHash: null,
        mustChangePassword: true,
        createdOn: dates.today()
      };

      return LMS.auth.setPassword(member, values.password).then(function () {
        db().members.push(member);
        LMS.store.save();
        ui.modal.close();
        ui.toast(member.name + ' registered as ' + member.code + '.', 'success');
        LMS.app.refresh();
      });
    },

    'book-create': function (form) {
      var values = ui.formValues(form);
      var year = values.year === '' ? null : Number(values.year);

      if (!values.title) return ui.toast('Enter the book title.', 'error');
      if (values.isbn && db().books.some(function (book) { return book.isbn === values.isbn; })) {
        return ui.toast('That ISBN is already in the catalogue.', 'error');
      }
      if (year !== null && (isNaN(year) || year < 1000 || year > new Date().getFullYear() + 1)) {
        return ui.toast('Enter a valid year of publication.', 'error');
      }
      if (values.accession && db().copies.some(function (copy) {
        return copy.accession.toLowerCase() === values.accession.toLowerCase();
      })) {
        return ui.toast('That accession number is already in use.', 'error');
      }

      var book = {
        id: LMS.store.nextId('book'),
        title: values.title,
        isbn: values.isbn,
        author: values.author,
        category: values.category,
        publisher: values.publisher,
        year: year,
        description: values.description,
        addedOn: dates.today()
      };
      db().books.push(book);

      if (values.accession) {
        db().copies.push({
          id: LMS.store.nextId('copy'),
          bookId: book.id,
          accession: values.accession,
          shelf: values.shelf,
          status: 'available'
        });
      }

      LMS.store.save();
      ui.modal.close();
      ui.toast('“' + book.title + '” added to the catalogue.', 'success');
      LMS.app.refresh();
    },

    'copy-create': function (form) {
      var values = ui.formValues(form);
      var book = query.book(Number(values.bookId));
      if (!book) return;

      if (!values.accession) return ui.toast('Enter an accession number.', 'error');
      if (db().copies.some(function (copy) {
        return copy.accession.toLowerCase() === values.accession.toLowerCase();
      })) {
        return ui.toast('That accession number is already in use.', 'error');
      }

      db().copies.push({
        id: LMS.store.nextId('copy'),
        bookId: book.id,
        accession: values.accession,
        shelf: values.shelf,
        status: 'available'
      });
      LMS.store.save();
      ui.toast('Copy ' + values.accession + ' added.', 'success');
      actions['book-copies']({ id: String(book.id) });
      LMS.app.refresh();
    },

    'loan-create': function (form) {
      var values = ui.formValues(form);
      var member = query.member(Number(values.memberId));
      var copy = query.copy(Number(values.copyId));

      if (!member || !copy) return ui.toast('Choose both a student and a copy.', 'error');
      if (member.status !== 'active') return ui.toast(member.name + '’s membership is suspended.', 'error');
      if (copy.status !== 'available') return ui.toast('That copy is no longer on the shelf.', 'error');

      var onLoan = query.loansOfMember(member.id, 'issued').length;
      if (onLoan >= member.maxLoans) {
        return ui.toast(member.name + ' already has ' + onLoan + ' of ' + member.maxLoans + ' books out.', 'error');
      }

      var outstanding = query.outstandingFor(member.id);
      if (outstanding > settings().fineBlockLimit) {
        return ui.toast(member.name + ' owes ' + money(outstanding) + ', above the ' +
                        money(settings().fineBlockLimit) + ' limit for borrowing.', 'error');
      }

      var dueDate = dates.addDays(dates.today(), settings().loanDays);
      db().loans.push({
        id: LMS.store.nextId('loan'),
        copyId: copy.id,
        memberId: member.id,
        issueDate: dates.today(),
        dueDate: dueDate,
        returnDate: null,
        renewals: 0,
        status: 'issued'
      });
      copy.status = 'issued';

      // Issuing the book satisfies the borrower's own reservation for it.
      var reservation = query.reservationFor(copy.bookId, member.id);
      if (reservation) {
        reservation.status = 'fulfilled';
        reservation.fulfilledOn = dates.today();
      }

      LMS.store.save();
      ui.toast('Issued to ' + member.name + '. Due back ' + dates.format(dueDate) + '.', 'success');
      LMS.app.refresh();
    },

    'fine-pay': function (form) {
      var values = ui.formValues(form);
      var fine = db().fines.find(function (item) { return item.id === Number(values.fineId); });
      if (!fine) return;

      var amount = Number(values.amount);
      var outstanding = fine.amount - fine.paid;

      if (isNaN(amount) || amount <= 0) return ui.toast('Enter the amount received.', 'error');
      if (amount > outstanding + 0.001) {
        return ui.toast('That is more than the ' + money(outstanding) + ' outstanding.', 'error');
      }

      fine.paid = Math.round((fine.paid + amount) * 100) / 100;
      fine.payments.push({ date: dates.today(), amount: amount });
      fine.status = fine.paid >= fine.amount ? 'paid' : 'partial';

      LMS.store.save();
      ui.modal.close();
      ui.toast('Payment of ' + money(amount) + ' recorded.', 'success');
      LMS.app.refresh();
    },

    'settings-save': function (form) {
      var values = ui.formValues(form);
      var next = {
        loanDays: Number(values.loanDays),
        finePerDay: Number(values.finePerDay),
        maxLoans: Number(values.maxLoans),
        maxRenewals: Number(values.maxRenewals),
        fineBlockLimit: Number(values.fineBlockLimit)
      };

      if (!(next.loanDays >= 1 && next.loanDays <= 120)) return ui.toast('The loan period must be between 1 and 120 days.', 'error');
      if (!(next.finePerDay >= 0 && next.finePerDay <= 1000)) return ui.toast('Enter a daily fine between 0 and 1000.', 'error');
      if (!(next.maxLoans >= 1 && next.maxLoans <= 20)) return ui.toast('The borrowing limit must be between 1 and 20.', 'error');
      if (!(next.maxRenewals >= 0 && next.maxRenewals <= 5)) return ui.toast('Renewals must be between 0 and 5.', 'error');
      if (!(next.fineBlockLimit >= 0)) return ui.toast('Enter a valid borrowing block limit.', 'error');

      Object.assign(settings(), next);
      LMS.store.save();
      ui.toast('Lending rules updated. New loans use these values.', 'success');
      LMS.app.refresh();
    },

    'profile-save': function (form) {
      var values = ui.formValues(form);
      var account = me();

      if (!LMS.validate.name(values.name)) return ui.toast('Enter your full name.', 'error');
      if (!LMS.validate.phone(values.phone)) return ui.toast('Enter a valid phone number, or leave it blank.', 'error');

      // Email and role are intentionally absent: they are not editable here.
      account.name = values.name;
      account.phone = values.phone;
      account.department = values.department;

      if (role() === 'member') {
        account.course = values.course;
        account.semester = values.semester;
        account.notes = values.notes;
      } else {
        account.designation = values.designation;
        account.bio = values.bio;
      }

      LMS.store.save();
      LMS.app.syncHeader();
      ui.toast('Your details were saved.', 'success');
      LMS.app.refresh();
    },

    'password-change': function (form) {
      var values = ui.formValues(form);
      var account = me();

      if (!LMS.validate.password(values.next)) {
        return ui.toast('The new password needs at least 6 characters.', 'error');
      }
      if (values.next !== values.confirm) {
        return ui.toast('The two new passwords do not match.', 'error');
      }

      return LMS.auth.verify(account, values.current).then(function (valid) {
        if (!valid) {
          ui.toast('Your current password is not correct.', 'error');
          return;
        }
        return LMS.auth.setPassword(account, values.next).then(function () {
          account.mustChangePassword = false;
          LMS.store.save();
          ui.toast('Your password has been changed.', 'success');
          LMS.app.refresh();
        });
      });
    }
  };

  /* Inline <select> controls (copy status) are dispatched on change. */
  var changeActions = {
    'copy-status': function (dataset, element) {
      var copy = query.copy(Number(dataset.id));
      if (!copy || copy.status === 'issued') return;
      copy.status = element.value;
      LMS.store.save();
      ui.toast('Copy ' + copy.accession + ' marked as ' + element.value + '.', 'success');
      LMS.app.refresh();
    }
  };

  LMS.pages = {
    home: home,
    librarians: librarians,
    students: students,
    books: books,
    issue: issue,
    'return': returns,
    reservations: reservations,
    fines: fines,
    reports: reports,
    settings: settingsPage,
    catalog: catalog,
    loans: myLoans,
    profile: profile
  };

  LMS.actions = actions;
  LMS.changeActions = changeActions;
  LMS.forms = forms;
  LMS.filters = filters;
})(window);
