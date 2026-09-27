/*
 * Library ASBA — Library Management System
 * core.js — safe HTML construction, date arithmetic, persistence and auth.
 *
 * The application is deliberately backend-free: the entire database lives in
 * localStorage. Passwords are salted and hashed before they are written so a
 * storage dump is not a list of plaintext credentials — but see the "Security
 * model" section of README.md: with no server this is obfuscation, not
 * security. Anything a browser can read, a determined user can rewrite.
 */
(function (window) {
  'use strict';

  var LMS = window.LMS || (window.LMS = {});

  LMS.config = {
    appName: 'Library ASBA',
    tagline: 'Library Management System',
    storageKey: 'asba_library_db',
    legacyStorageKey: 'lms_data_v1',
    sessionKey: 'asba_library_session',
    schemaVersion: 2,
    sessionHours: 8
  };

  /* ==========================================================================
   * 1. Safe HTML construction
   *
   * Every page in this app builds markup as strings. Rather than remembering
   * to call an escape helper at each interpolation — which is exactly the kind
   * of thing that gets missed — the `html` tagged template escapes values by
   * default. Markup that is intentionally raw must be wrapped in `raw()`, and
   * `html` itself returns a raw value so templates nest cleanly.
   * ========================================================================== */

  var RAW = Symbol('raw');

  var ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHTML(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, function (character) {
        return ESCAPE_MAP[character];
      });
  }

  function raw(value) {
    var text = String(value);
    var marker = {};
    marker[RAW] = text;
    marker.toString = function () {
      return text;
    };
    return marker;
  }

  function isRaw(value) {
    return typeof value === 'object' && value !== null && RAW in value;
  }

  function interpolate(value) {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) return value.map(interpolate).join('');
    if (isRaw(value)) return value[RAW];
    return escapeHTML(value);
  }

  function html(strings) {
    var output = strings[0];
    for (var i = 1; i < arguments.length; i++) {
      output += interpolate(arguments[i]) + strings[i];
    }
    return raw(output);
  }

  LMS.escapeHTML = escapeHTML;
  LMS.raw = raw;
  LMS.html = html;

  /* ==========================================================================
   * 2. Dates
   *
   * All dates are stored as local calendar days in YYYY-MM-DD form. The
   * previous implementation round-tripped through toISOString(), which is UTC:
   * east of Greenwich every due date came back a day early, and after ~18:30
   * IST "today" was still yesterday. Everything here works in local time and
   * never touches toISOString().
   * ========================================================================== */

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var dates = {
    /** Format a Date as a local YYYY-MM-DD calendar day. */
    toISO: function (date) {
      var year = date.getFullYear();
      var month = String(date.getMonth() + 1).padStart(2, '0');
      var day = String(date.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    },

    /** Today as a local calendar day. */
    today: function () {
      return dates.toISO(new Date());
    },

    /** Parse YYYY-MM-DD into a Date at local midnight. */
    parse: function (iso) {
      var parts = String(iso || '').split('-').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) return null;
      return new Date(parts[0], parts[1] - 1, parts[2]);
    },

    addDays: function (iso, amount) {
      var date = dates.parse(iso);
      if (!date) return iso;
      date.setDate(date.getDate() + Number(amount));
      return dates.toISO(date);
    },

    /**
     * Whole days from `fromISO` to `toISO`. Rounding (rather than flooring the
     * millisecond difference) keeps this correct across daylight-saving
     * transitions, where a local day can be 23 or 25 hours long.
     */
    diffDays: function (fromISO, toISO) {
      var from = dates.parse(fromISO);
      var to = dates.parse(toISO);
      if (!from || !to) return 0;
      return Math.round((to - from) / 86400000);
    },

    /** Days a loan is past its due date, never negative. */
    daysOverdue: function (dueISO, referenceISO) {
      return Math.max(0, dates.diffDays(dueISO, referenceISO || dates.today()));
    },

    isBefore: function (aISO, bISO) {
      return dates.diffDays(aISO, bISO) > 0;
    },

    /** Human-readable form, e.g. "14 Aug 2026". */
    format: function (iso) {
      var date = dates.parse(iso);
      if (!date) return '—';
      return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    }
  };

  LMS.dates = dates;

  /* ==========================================================================
   * 3. Formatting and validation
   * ========================================================================== */

  var currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  LMS.money = function (amount) {
    var value = Number(amount);
    return currencyFormatter.format(isNaN(value) ? 0 : value);
  };

  LMS.validate = {
    email: function (value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
    },
    phone: function (value) {
      var text = String(value || '').trim();
      return text === '' || /^[0-9+()\s.-]{7,20}$/.test(text);
    },
    password: function (value) {
      return String(value || '').length >= 6;
    },
    name: function (value) {
      return String(value || '').trim().length >= 2;
    }
  };

  LMS.normaliseEmail = function (value) {
    return String(value || '').trim().toLowerCase();
  };

  /* ==========================================================================
   * 4. Password hashing
   *
   * SubtleCrypto is used where available. It requires a secure context, so a
   * deterministic fallback keeps the app usable when the files are opened
   * directly from disk (file://) during marking or demonstration.
   * ========================================================================== */

  var HASH_ROUNDS = 120;

  function fallbackDigest(text) {
    var seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
    return seeds.map(function (seed) {
      var hash = seed >>> 0;
      for (var i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    }).join('');
  }

  function digest(text) {
    if (window.crypto && window.crypto.subtle) {
      var bytes = new TextEncoder().encode(text);
      return window.crypto.subtle.digest('SHA-256', bytes).then(function (buffer) {
        return Array.from(new Uint8Array(buffer)).map(function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      });
    }
    return Promise.resolve(fallbackDigest(text));
  }

  function createSalt() {
    var bytes = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes).map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function hashPassword(password, salt) {
    var value = salt + ':' + password;
    var chain = Promise.resolve(value);
    for (var round = 0; round < HASH_ROUNDS; round++) {
      chain = chain.then(function (current) {
        return digest(current);
      });
    }
    return chain;
  }

  /** Readable temporary password, e.g. "asba-4712". */
  function temporaryPassword() {
    var bytes = new Uint8Array(2);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      bytes[0] = Math.floor(Math.random() * 256);
      bytes[1] = Math.floor(Math.random() * 256);
    }
    var number = ((bytes[0] << 8) | bytes[1]) % 9000 + 1000;
    return 'asba-' + number;
  }

  /* ==========================================================================
   * 5. Persistence
   *
   * A single in-memory copy of the database is loaded once and mutated in
   * place; `store.save()` is the only writer. Reading the store on every render
   * (as the previous build did) meant renderers could silently disagree about
   * what the data was midway through a page.
   * ========================================================================== */

  function defaultSettings() {
    return {
      loanDays: 14,
      finePerDay: 5,
      maxLoans: 5,
      maxRenewals: 2,
      fineBlockLimit: 100
    };
  }

  function emptyDatabase() {
    return {
      version: LMS.config.schemaVersion,
      settings: defaultSettings(),
      counters: { book: 0, copy: 0, member: 0, user: 0, loan: 0, fine: 0, reservation: 0 },
      books: [],
      copies: [],
      members: [],
      users: [],
      loans: [],
      fines: [],
      reservations: []
    };
  }

  var SEED_BOOKS = [
    { title: 'Clean Code', isbn: '9780132350884', author: 'Robert C. Martin', category: 'Programming', publisher: 'Prentice Hall', year: 2008, description: 'A handbook of agile software craftsmanship covering naming, functions, formatting and refactoring.', copies: ['CC-001', 'CC-002'], shelf: 'A-01' },
    { title: 'Introduction to Algorithms', isbn: '9780262046305', author: 'Thomas H. Cormen', category: 'Computer Science', publisher: 'MIT Press', year: 2022, description: 'Comprehensive reference on algorithm design, analysis and data structures.', copies: ['ALG-001'], shelf: 'A-02' },
    { title: 'Python Crash Course', isbn: '9781593279288', author: 'Eric Matthes', category: 'Programming', publisher: 'No Starch Press', year: 2023, description: 'Project-based introduction to Python covering syntax, data handling and small applications.', copies: ['PY-001', 'PY-002'], shelf: 'B-01' },
    { title: 'Database System Concepts', isbn: '9780078022159', author: 'Abraham Silberschatz', category: 'Databases', publisher: 'McGraw Hill', year: 2019, description: 'Relational model, SQL, normalisation, transactions and storage internals.', copies: ['DB-001'], shelf: 'B-02' },
    { title: 'Computer Networks', isbn: '9780132126953', author: 'Andrew S. Tanenbaum', category: 'Networking', publisher: 'Pearson', year: 2021, description: 'Layered treatment of network architecture from the physical layer upwards.', copies: ['NET-001'], shelf: 'C-01' },
    { title: 'The Pragmatic Programmer', isbn: '9780135957059', author: 'David Thomas', category: 'Programming', publisher: 'Addison-Wesley', year: 2019, description: 'Practical advice on craft, tooling, automation and career development.', copies: ['PP-001'], shelf: 'A-03' }
  ];

  var SEED_ACCOUNTS = [
    { kind: 'user', name: 'Asha', email: 'admin@library.com', role: 'admin', designation: 'System Administrator', department: 'Library Administration', password: 'admin12' },
    { kind: 'user', name: 'Rahul Iyer', email: 'librarian@library.com', role: 'librarian', designation: 'Senior Librarian', department: 'Circulation Desk', password: 'lib123' },
    { kind: 'member', name: 'Neha Sharma', email: 'member@library.com', department: 'Computer Science', course: 'B.Tech Computer Science', semester: '5th Semester', password: 'member123' },
    { kind: 'member', name: 'Imran Qureshi', email: 'imran@library.com', department: 'Electronics', course: 'B.Tech Electronics', semester: '3rd Semester', password: 'member123' }
  ];

  var state = null;

  var store = {
    get data() {
      return state;
    },

    /** Load, migrate or seed the database. Safe to call more than once. */
    ready: function () {
      if (state) return Promise.resolve(state);

      var stored = readJSON(LMS.config.storageKey);
      if (stored) {
        state = migrate(stored);
        store.save();
        return Promise.resolve(state);
      }

      var legacy = readJSON(LMS.config.legacyStorageKey);
      if (legacy) {
        state = migrate(legacy);
        store.save();
        return Promise.resolve(state);
      }

      return seed().then(function (database) {
        state = database;
        store.save();
        return state;
      });
    },

    save: function () {
      try {
        window.localStorage.setItem(LMS.config.storageKey, JSON.stringify(state));
        return true;
      } catch (error) {
        // Quota exhaustion, or Safari private browsing. Fail loudly rather
        // than letting the UI report a save that never happened.
        if (LMS.ui && LMS.ui.toast) {
          LMS.ui.toast('Could not save to this browser’s storage. Your last change was not kept.', 'error');
        }
        return false;
      }
    },

    /**
     * Monotonic identifiers. Deriving the next id from max(existing) meant ids
     * were recycled after a deletion, so historical records could end up
     * pointing at a different record than the one they were written for.
     */
    nextId: function (collection) {
      if (!state.counters) state.counters = {};
      var current = Number(state.counters[collection]) || 0;
      state.counters[collection] = current + 1;
      return state.counters[collection];
    },

    reset: function () {
      window.localStorage.removeItem(LMS.config.storageKey);
      window.localStorage.removeItem(LMS.config.legacyStorageKey);
      window.localStorage.removeItem(LMS.config.sessionKey);
      state = null;
    }
  };

  function readJSON(key) {
    try {
      var text = window.localStorage.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      window.localStorage.removeItem(key);
      return null;
    }
  }

  function seed() {
    var database = emptyDatabase();

    SEED_BOOKS.forEach(function (entry) {
      var bookId = store_nextId(database, 'book');
      database.books.push({
        id: bookId,
        title: entry.title,
        isbn: entry.isbn,
        author: entry.author,
        category: entry.category,
        publisher: entry.publisher,
        year: entry.year,
        description: entry.description,
        addedOn: dates.today()
      });
      entry.copies.forEach(function (accession) {
        database.copies.push({
          id: store_nextId(database, 'copy'),
          bookId: bookId,
          accession: accession,
          shelf: entry.shelf,
          status: 'available'
        });
      });
    });

    var work = SEED_ACCOUNTS.map(function (entry) {
      var salt = createSalt();
      return hashPassword(entry.password, salt).then(function (passwordHash) {
        if (entry.kind === 'user') {
          database.users.push({
            id: store_nextId(database, 'user'),
            name: entry.name,
            email: entry.email,
            role: entry.role,
            status: 'active',
            department: entry.department,
            designation: entry.designation,
            phone: '',
            bio: '',
            salt: salt,
            passwordHash: passwordHash,
            mustChangePassword: false,
            createdOn: dates.today()
          });
        } else {
          var memberId = store_nextId(database, 'member');
          database.members.push({
            id: memberId,
            code: 'ST' + String(memberId).padStart(5, '0'),
            name: entry.name,
            email: entry.email,
            role: 'member',
            status: 'active',
            department: entry.department,
            course: entry.course,
            semester: entry.semester,
            phone: '',
            notes: '',
            maxLoans: database.settings.maxLoans,
            salt: salt,
            passwordHash: passwordHash,
            mustChangePassword: false,
            createdOn: dates.today()
          });
        }
      });
    });

    return Promise.all(work).then(function () {
      return database;
    });
  }

  function store_nextId(database, collection) {
    database.counters[collection] = (Number(database.counters[collection]) || 0) + 1;
    return database.counters[collection];
  }

  /**
   * Bring any previously stored database up to the current schema. Records
   * written by older builds are missing whole fields — reading them without a
   * migration is how `settings.maxLoans` used to throw on load.
   */
  function migrate(stored) {
    var database = emptyDatabase();

    database.settings = Object.assign(defaultSettings(), stored.settings || {});

    ['books', 'copies', 'members', 'users', 'loans', 'fines', 'reservations'].forEach(function (key) {
      database[key] = Array.isArray(stored[key]) ? stored[key] : [];
    });

    database.books.forEach(function (book) {
      book.id = Number(book.id);
      book.year = book.year === '' || book.year === null || book.year === undefined
        ? null
        : Number(book.year);
      if (typeof book.description !== 'string') book.description = '';
      if (!book.addedOn) book.addedOn = dates.today();
    });

    database.copies.forEach(function (copy) {
      copy.id = Number(copy.id);
      copy.bookId = Number(copy.bookId);
      if (['available', 'issued', 'lost', 'damaged'].indexOf(copy.status) === -1) {
        copy.status = 'available';
      }
    });

    database.members.forEach(function (member) {
      member.id = Number(member.id);
      member.role = 'member';
      if (!member.status) member.status = 'active';
      if (typeof member.phone !== 'string') member.phone = '';
      if (typeof member.notes !== 'string') member.notes = member.semester ? '' : '';
      if (!member.maxLoans) member.maxLoans = database.settings.maxLoans;
      if (!member.code) member.code = 'ST' + String(member.id).padStart(5, '0');
      if (!member.createdOn) member.createdOn = dates.today();
      if (!member.passwordHash) {
        member.passwordHash = null;
        member.salt = null;
        member.mustChangePassword = true;
      }
    });

    database.users.forEach(function (user) {
      user.id = Number(user.id);
      if (['admin', 'librarian'].indexOf(user.role) === -1) user.role = 'librarian';
      if (!user.status) user.status = 'active';
      if (typeof user.phone !== 'string') user.phone = '';
      if (typeof user.bio !== 'string') user.bio = '';
      if (!user.createdOn) user.createdOn = user.created && user.created !== 'System' ? user.created : dates.today();
      delete user.created;
      if (!user.passwordHash) {
        user.passwordHash = null;
        user.salt = null;
        user.mustChangePassword = true;
      }
    });

    database.loans.forEach(function (loan) {
      loan.id = Number(loan.id);
      loan.copyId = Number(loan.copyId);
      loan.memberId = Number(loan.memberId);
      if (typeof loan.renewals !== 'number') loan.renewals = 0;
      if (!loan.status) loan.status = loan.returnDate ? 'returned' : 'issued';
    });

    database.fines.forEach(function (fine) {
      fine.id = Number(fine.id);
      fine.loanId = Number(fine.loanId);
      fine.amount = Number(fine.amount) || 0;
      fine.paid = Number(fine.paid) || 0;
      if (!Array.isArray(fine.payments)) fine.payments = [];
      if (!fine.createdOn) fine.createdOn = dates.today();
      if (fine.memberId === undefined) {
        var loan = database.loans.find(function (item) { return item.id === fine.loanId; });
        fine.memberId = loan ? loan.memberId : null;
      }
      fine.status = fine.paid >= fine.amount ? 'paid' : (fine.paid > 0 ? 'partial' : 'unpaid');
    });

    database.reservations.forEach(function (reservation) {
      reservation.id = Number(reservation.id);
      reservation.bookId = Number(reservation.bookId);
      reservation.memberId = Number(reservation.memberId);
      if (!reservation.status) reservation.status = 'pending';
      if (!reservation.date) reservation.date = dates.today();
    });

    // Counters must start above every id ever issued, not at the current max.
    database.counters = {
      book: highestId(database.books, stored, 'book'),
      copy: highestId(database.copies, stored, 'copy'),
      member: highestId(database.members, stored, 'member'),
      user: highestId(database.users, stored, 'user'),
      loan: highestId(database.loans, stored, 'loan'),
      fine: highestId(database.fines, stored, 'fine'),
      reservation: highestId(database.reservations, stored, 'reservation')
    };

    database.version = LMS.config.schemaVersion;
    return database;
  }

  function highestId(collection, stored, key) {
    var previous = stored.counters ? Number(stored.counters[key]) || 0 : 0;
    var maximum = collection.reduce(function (best, record) {
      return Math.max(best, Number(record.id) || 0);
    }, 0);
    return Math.max(previous, maximum);
  }

  LMS.store = store;

  /* ==========================================================================
   * 6. Queries
   *
   * Shared lookups, so page code never re-implements "which copies of this
   * book are on the shelf" three different ways.
   * ========================================================================== */

  LMS.query = {
    account: function (id, role) {
      if (role === 'member') {
        return state.members.find(function (member) { return member.id === id; }) || null;
      }
      return state.users.find(function (user) { return user.id === id; }) || null;
    },

    accountByEmail: function (email) {
      var address = LMS.normaliseEmail(email);
      var user = state.users.find(function (item) {
        return LMS.normaliseEmail(item.email) === address;
      });
      if (user) return user;
      return state.members.find(function (item) {
        return LMS.normaliseEmail(item.email) === address;
      }) || null;
    },

    book: function (id) {
      return state.books.find(function (book) { return book.id === id; }) || null;
    },

    copy: function (id) {
      return state.copies.find(function (copy) { return copy.id === id; }) || null;
    },

    member: function (id) {
      return state.members.find(function (member) { return member.id === id; }) || null;
    },

    copiesOf: function (bookId) {
      return state.copies.filter(function (copy) { return copy.bookId === bookId; });
    },

    availableCopiesOf: function (bookId) {
      return state.copies.filter(function (copy) {
        return copy.bookId === bookId && copy.status === 'available';
      });
    },

    bookOfCopy: function (copyId) {
      var copy = LMS.query.copy(copyId);
      return copy ? LMS.query.book(copy.bookId) : null;
    },

    activeLoans: function () {
      return state.loans.filter(function (loan) { return loan.status === 'issued'; });
    },

    overdueLoans: function () {
      var today = dates.today();
      return LMS.query.activeLoans().filter(function (loan) {
        return dates.isBefore(loan.dueDate, today);
      });
    },

    loansOfMember: function (memberId, status) {
      return state.loans.filter(function (loan) {
        return loan.memberId === memberId && (!status || loan.status === status);
      });
    },

    outstandingFor: function (memberId) {
      return state.fines
        .filter(function (fine) { return fine.memberId === memberId && fine.status !== 'paid'; })
        .reduce(function (total, fine) { return total + (fine.amount - fine.paid); }, 0);
    },

    pendingReservations: function () {
      return state.reservations.filter(function (item) { return item.status === 'pending'; });
    },

    reservationFor: function (bookId, memberId) {
      return state.reservations.find(function (item) {
        return item.bookId === bookId && item.memberId === memberId && item.status === 'pending';
      }) || null;
    }
  };

  /* ==========================================================================
   * 7. Session and authentication
   *
   * The stored session carries an account id, not a role. The role is resolved
   * from the account record on every load, so editing the session blob in
   * devtools no longer promotes anyone: the account itself would have to be
   * changed, and the session is discarded if the two disagree.
   * ========================================================================== */

  var LOCKOUT_ATTEMPTS = 5;
  var LOCKOUT_SECONDS = 60;

  var session = {
    /** Resolve the signed-in account, or null when there is no valid session. */
    current: function () {
      var stored = readJSON(LMS.config.sessionKey);
      if (!stored || !stored.accountId || !stored.expiresAt) return null;
      if (Date.now() > stored.expiresAt) {
        session.clear();
        return null;
      }

      var account = LMS.query.accountByEmail(stored.email);
      if (!account || account.id !== stored.accountId) {
        session.clear();
        return null;
      }

      var role = account.role || 'member';
      if (stored.role !== role || account.status !== 'active') {
        session.clear();
        return null;
      }

      return { account: account, role: role };
    },

    start: function (account) {
      var payload = {
        accountId: account.id,
        email: LMS.normaliseEmail(account.email),
        role: account.role || 'member',
        startedAt: Date.now(),
        expiresAt: Date.now() + LMS.config.sessionHours * 3600 * 1000
      };
      window.localStorage.setItem(LMS.config.sessionKey, JSON.stringify(payload));
    },

    clear: function () {
      window.localStorage.removeItem(LMS.config.sessionKey);
    }
  };

  var auth = {
    createSalt: createSalt,
    hashPassword: hashPassword,
    temporaryPassword: temporaryPassword,

    /** Assign a password to an account record. Does not persist. */
    setPassword: function (account, password) {
      var salt = createSalt();
      return hashPassword(password, salt).then(function (passwordHash) {
        account.salt = salt;
        account.passwordHash = passwordHash;
        return account;
      });
    },

    verify: function (account, password) {
      if (!account || !account.passwordHash || !account.salt) return Promise.resolve(false);
      return hashPassword(password, account.salt).then(function (candidate) {
        return candidate === account.passwordHash;
      });
    },

    lockoutRemaining: function () {
      var record = readAttempts();
      if (record.lockedUntil && Date.now() < record.lockedUntil) {
        return Math.ceil((record.lockedUntil - Date.now()) / 1000);
      }
      return 0;
    },

    /**
     * Resolve to { ok: true, account } or { ok: false, reason, message }.
     * Unknown addresses and wrong passwords share one message so the form is
     * not a directory of who holds an account here.
     */
    login: function (email, password) {
      var remaining = auth.lockoutRemaining();
      if (remaining > 0) {
        return Promise.resolve({
          ok: false,
          reason: 'locked',
          message: 'Too many failed attempts. Try again in ' + remaining + ' seconds.'
        });
      }

      var account = LMS.query.accountByEmail(email);

      if (!account) {
        recordFailure();
        return Promise.resolve({
          ok: false,
          reason: 'credentials',
          message: 'Email address or password is incorrect.'
        });
      }

      if (!account.passwordHash) {
        return Promise.resolve({
          ok: false,
          reason: 'no-password',
          message: 'No password is set for this account. Ask staff to issue one — or, if you are ' +
                   'upgrading from an older version, use “Reset stored data” below.'
        });
      }

      if (account.status !== 'active') {
        return Promise.resolve({
          ok: false,
          reason: 'inactive',
          message: 'This account is deactivated. Contact the library administrator.'
        });
      }

      return auth.verify(account, password).then(function (valid) {
        if (!valid) {
          recordFailure();
          return {
            ok: false,
            reason: 'credentials',
            message: 'Email address or password is incorrect.'
          };
        }
        clearAttempts();
        session.start(account);
        return { ok: true, account: account };
      });
    }
  };

  function readAttempts() {
    try {
      return JSON.parse(window.sessionStorage.getItem('asba_login_attempts') || '{}');
    } catch (error) {
      return {};
    }
  }

  function writeAttempts(record) {
    try {
      window.sessionStorage.setItem('asba_login_attempts', JSON.stringify(record));
    } catch (error) {
      /* Storage unavailable — throttling is a nicety, not a requirement. */
    }
  }

  function recordFailure() {
    var record = readAttempts();
    record.count = (Number(record.count) || 0) + 1;
    if (record.count >= LOCKOUT_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
      record.count = 0;
    }
    writeAttempts(record);
  }

  function clearAttempts() {
    writeAttempts({});
  }

  LMS.session = session;
  LMS.auth = auth;

  LMS.roleLabel = function (role) {
    if (role === 'admin') return 'Administrator';
    if (role === 'librarian') return 'Librarian';
    return 'Student';
  };
})(window);
