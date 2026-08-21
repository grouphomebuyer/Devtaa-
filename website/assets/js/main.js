/* ==========================================================================
   Devtaa Developers — site behaviour
   Vanilla JS, no dependencies. Every block is defensive: a page that does not
   contain a widget simply skips it.
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* --- Mobile navigation ------------------------------------------------- */
  function initNav() {
    var toggle = $('.nav-toggle');
    var nav = $('.mainnav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }

    // Dropdowns: hover on desktop, click on touch / small screens.
    $$('.has-drop').forEach(function (item) {
      var btn = $('.nav-link', item);
      var isDesktop = function () { return window.matchMedia('(min-width:961px)').matches; };

      item.addEventListener('mouseenter', function () { if (isDesktop()) item.setAttribute('data-open', 'true'); });
      item.addEventListener('mouseleave', function () { if (isDesktop()) item.setAttribute('data-open', 'false'); });

      if (btn) {
        btn.addEventListener('click', function (e) {
          if (btn.tagName === 'BUTTON' || !isDesktop()) {
            e.preventDefault();
            var open = item.getAttribute('data-open') === 'true';
            item.setAttribute('data-open', String(!open));
            btn.setAttribute('aria-expanded', String(!open));
          }
        });
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.body.classList.remove('nav-open');
        $$('.has-drop').forEach(function (i) { i.setAttribute('data-open', 'false'); });
      }
    });

    // Sticky header shadow
    var header = $('.site-header');
    if (header) {
      var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  /* --- Hero slider ------------------------------------------------------- */
  function initHero() {
    var hero = $('.hero__slides');
    if (!hero) return;
    var slides = $$('.hero__slide', hero);
    var dots = $$('.hero__dots button');
    if (slides.length < 2) return;

    var index = 0, timer = null, DELAY = 6000;

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) { s.classList.toggle('is-active', n === index); });
      dots.forEach(function (d, n) { d.setAttribute('aria-selected', String(n === index)); });
    }
    function play() { stop(); timer = setInterval(function () { show(index + 1); }, DELAY); }
    function stop() { if (timer) clearInterval(timer); }

    dots.forEach(function (d, n) {
      d.addEventListener('click', function () { show(n); play(); });
    });

    var section = $('.hero');
    section.addEventListener('mouseenter', stop);
    section.addEventListener('mouseleave', play);
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : play(); });

    show(0);
    if (!window.matchMedia('(prefers-reduced-motion:reduce)').matches) play();
  }

  /* --- Animated counters ------------------------------------------------- */
  function initCounters() {
    var nums = $$('[data-count]');
    if (!nums.length || !('IntersectionObserver' in window)) {
      nums.forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count'));
        var suffix = el.getAttribute('data-suffix') || '';
        var decimals = (String(target).split('.')[1] || '').length;
        var start = null, DUR = 1600;
        function step(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / DUR, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* --- Scroll reveal ----------------------------------------------------- */
  function initReveal() {
    var els = $$('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 90) + 'ms';
      io.observe(el);
    });
  }

  /* --- Tabs (explore by city, project detail) ---------------------------- */
  function initTabs() {
    $$('[data-tabs]').forEach(function (group) {
      var buttons = $$('[role="tab"]', group);
      var panels = $$('[role="tabpanel"]', group);
      buttons.forEach(function (btn, i) {
        btn.addEventListener('click', function () {
          buttons.forEach(function (b, n) { b.setAttribute('aria-selected', String(n === i)); });
          panels.forEach(function (p, n) { p.hidden = n !== i; });
        });
        btn.addEventListener('keydown', function (e) {
          var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          var next = buttons[(i + dir + buttons.length) % buttons.length];
          next.focus(); next.click();
        });
      });
    });
  }

  /* --- Testimonial rotator ----------------------------------------------- */
  function initQuotes() {
    var box = $('.quotes');
    if (!box) return;
    var quotes = $$('.quote', box);
    var dots = $$('.quotes__nav button', box);
    if (quotes.length < 2) return;
    var i = 0, timer;

    function show(n) {
      i = (n + quotes.length) % quotes.length;
      quotes.forEach(function (q, k) { q.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) { d.setAttribute('aria-selected', String(k === i)); });
    }
    dots.forEach(function (d, n) { d.addEventListener('click', function () { show(n); restart(); }); });
    function restart() { clearInterval(timer); timer = setInterval(function () { show(i + 1); }, 7000); }
    show(0); restart();
    box.addEventListener('mouseenter', function () { clearInterval(timer); });
    box.addEventListener('mouseleave', restart);
  }

  /* --- Accordion --------------------------------------------------------- */
  function initAccordion() {
    $$('.accordion__btn').forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (!panel) return;
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        // close siblings inside the same accordion
        var root = btn.closest('.accordion');
        if (root && !open) {
          $$('.accordion__btn[aria-expanded="true"]', root).forEach(function (other) {
            other.setAttribute('aria-expanded', 'false');
            var op = document.getElementById(other.getAttribute('aria-controls'));
            if (op) op.style.maxHeight = null;
          });
        }
        btn.setAttribute('aria-expanded', String(!open));
        panel.style.maxHeight = open ? null : panel.scrollHeight + 'px';
      });
    });
  }

  /* --- Project filtering (projects.html) --------------------------------- */
  function initFilters() {
    var form = $('#project-filters');
    if (!form) return;
    var cards = $$('[data-project]');
    var count = $('#result-count');
    var empty = $('#no-results');

    function budgetMatches(cardValue, wanted) {
      if (!wanted) return true;
      return cardValue === wanted;
    }

    function apply() {
      var status = form.status.value;
      var city = form.city.value;
      var type = form.type.value;
      var budget = form.budget.value;
      var shown = 0;

      cards.forEach(function (card) {
        var ok = (!status || card.dataset.status === status) &&
                 (!city || card.dataset.city === city) &&
                 (!type || card.dataset.type === type) &&
                 budgetMatches(card.dataset.budget, budget);
        card.hidden = !ok;
        if (ok) shown++;
      });

      if (count) count.innerHTML = 'Showing <b>' + shown + '</b> of <b>' + cards.length + '</b> projects';
      if (empty) empty.hidden = shown !== 0;
    }

    // Pre-select from ?status=&city=&type=&budget= (the homepage search bar links here)
    var params = new URLSearchParams(window.location.search);
    ['status', 'city', 'type', 'budget'].forEach(function (key) {
      var val = params.get(key);
      if (val && form[key]) {
        var exists = Array.prototype.some.call(form[key].options, function (o) { return o.value === val; });
        if (exists) form[key].value = val;
      }
    });

    form.addEventListener('change', apply);
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    var reset = $('#filter-reset');
    if (reset) reset.addEventListener('click', function () { form.reset(); apply(); });
    apply();
  }

  /* --- Homepage search bar → projects.html ------------------------------- */
  function initSearchBar() {
    var form = $('#hero-search');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var params = new URLSearchParams();
      ['city', 'type', 'budget'].forEach(function (key) {
        if (form[key] && form[key].value) params.set(key, form[key].value);
      });
      var qs = params.toString();
      window.location.href = 'projects.html' + (qs ? '?' + qs : '');
    });
  }

  /* --- Enquiry forms ------------------------------------------------------
     Works in two modes:
       1. Odoo   — the <form> carries data-odoo-endpoint (e.g. /website/form/crm.lead).
                   Fields are posted there and the lead lands in Odoo CRM.
       2. Static — no endpoint configured: the submission is validated and a
                   confirmation is shown, so the site can be demoed before the
                   CRM is wired up. See README.md.
     --------------------------------------------------------------------- */
  function initForms() {
    $$('form[data-enquiry]').forEach(function (form) {
      var status = $('.form-status', form);

      function setError(field, message) {
        var wrap = field.closest('.field');
        if (!wrap) return;
        wrap.classList.toggle('is-invalid', Boolean(message));
        var slot = $('.err', wrap);
        if (slot) slot.textContent = message || '';
      }

      function validate() {
        var valid = true;
        $$('input,select,textarea', form).forEach(function (field) {
          if (field.type === 'hidden' || field.type === 'submit') return;
          var value = (field.value || '').trim();
          var message = '';

          if (field.required && !value && field.type !== 'checkbox') message = 'This field is required.';
          else if (field.required && field.type === 'checkbox' && !field.checked) message = 'Please accept to continue.';
          else if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = 'Enter a valid email address.';
          else if (field.type === 'tel' && value && !/^[0-9+\-()\s]{10,16}$/.test(value)) message = 'Enter a valid phone number.';

          if (message) valid = false;
          setError(field, message);
        });
        return valid;
      }

      $$('input,select,textarea', form).forEach(function (field) {
        field.addEventListener('blur', function () { if (field.value) validate(); });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (status) status.className = 'form-status';
        if (!validate()) {
          if (status) {
            status.className = 'form-status is-err';
            status.textContent = 'Please correct the highlighted fields and try again.';
          }
          var firstBad = $('.field.is-invalid input,.field.is-invalid select,.field.is-invalid textarea', form);
          if (firstBad) firstBad.focus();
          return;
        }

        var endpoint = form.getAttribute('data-odoo-endpoint');
        var button = $('button[type="submit"]', form);
        var label = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = 'Sending…'; }

        function done(ok, message) {
          if (button) { button.disabled = false; button.textContent = label; }
          if (status) {
            status.className = 'form-status ' + (ok ? 'is-ok' : 'is-err');
            status.textContent = message;
            status.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
          if (ok) form.reset();
        }

        if (!endpoint) {
          // Static preview mode.
          setTimeout(function () {
            done(true, 'Thank you. Your enquiry has been recorded. Our relationship manager will call you within one working day.');
          }, 500);
          return;
        }

        fetch(endpoint, { method: 'POST', body: new FormData(form) })
          .then(function (res) { return res.ok ? res.json().catch(function () { return { id: true }; }) : Promise.reject(res.status); })
          .then(function () {
            done(true, 'Thank you. Your enquiry has been received — our relationship manager will call you within one working day.');
          })
          .catch(function () {
            done(false, 'Sorry, we could not submit your enquiry. Please call +91 98765 43210 or email sales@devtaadevelopers.com.');
          });
      });
    });
  }

  /* --- Footer year ------------------------------------------------------- */
  function initYear() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* --- Boot -------------------------------------------------------------- */
  function boot() {
    initNav(); initHero(); initCounters(); initReveal(); initTabs();
    initQuotes(); initAccordion(); initFilters(); initSearchBar(); initForms(); initYear();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
