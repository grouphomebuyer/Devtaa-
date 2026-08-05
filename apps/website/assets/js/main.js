/* =========================================================================
   Devtaa Developers — site behaviour
   No dependencies. Safe to load with `defer`.
   ========================================================================= */

/* -------------------------------------------------------------------------
   SITE CONFIG — edit these three values before going live.
   ------------------------------------------------------------------------- */
window.DEVTAA = {
  // Phone shown across the site and used by tel: links (digits only for tel).
  phone: '+91 98204 00000',
  phoneTel: '+919820400000',

  // WhatsApp number in international format, no "+" and no spaces.
  whatsapp: '919820400000',

  // Where the enquiry forms POST.
  // Free options that need no server: https://formspree.io  or  https://web3forms.com
  // Paste the endpoint you get after signing up, e.g.
  //   'https://formspree.io/f/xxxxxxxx'
  // Leave empty ('') and every form falls back to opening WhatsApp with the
  // message pre-filled, so the site still generates leads on day one.
  formEndpoint: ''
};

(function () {
  'use strict';

  var cfg = window.DEVTAA;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------------- */
  var toggle = $('.nav-toggle');
  var nav = $('#primary-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('is-locked', open);
    });

    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('is-locked');
      });
    });
  }

  /* ---------------------------------------------------------------------
     Sticky header shadow + back-to-top visibility
     --------------------------------------------------------------------- */
  var header = $('.header');
  var toTop = $('.floater--top');

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('is-stuck', y > 12);
    if (toTop) toTop.classList.toggle('is-visible', y > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------------------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------------------- */
  var revealables = $$('.reveal');
  if (revealables.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealables.forEach(function (el) { io.observe(el); });
    } else {
      revealables.forEach(function (el) { el.classList.add('is-in'); });
    }
  }

  /* ---------------------------------------------------------------------
     Counters in the stats strip
     --------------------------------------------------------------------- */
  function runCounter(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var decimals = (el.getAttribute('data-decimals') | 0);
    var start = null;
    var dur = 1400;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { runCounter(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------------------------------------------------------------------
     Accordions (FAQ)
     --------------------------------------------------------------------- */
  $$('.acc-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (panel) panel.classList.toggle('is-open', !open);
    });
  });

  /* ---------------------------------------------------------------------
     Project filters
     --------------------------------------------------------------------- */
  var filterBar = $('.filters');
  if (filterBar) {
    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter');
      if (!btn) return;
      var key = btn.getAttribute('data-filter');

      $$('.filter', filterBar).forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');

      $$('[data-status]').forEach(function (card) {
        var show = key === 'all' || card.getAttribute('data-status') === key;
        card.style.display = show ? '' : 'none';
      });
    });
  }

  /* ---------------------------------------------------------------------
     Enquiry modal
     --------------------------------------------------------------------- */
  var modal = $('#enquiry-modal');
  var lastFocus = null;

  function openModal(projectName) {
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add('is-open');
    document.body.classList.add('is-locked');
    var hidden = $('input[name="project"]', modal);
    if (hidden && projectName) hidden.value = projectName;
    var first = $('input:not([type=hidden]):not(.honeypot input)', modal);
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (lastFocus) lastFocus.focus();
  }

  $$('[data-enquire]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(btn.getAttribute('data-enquire') || document.title);
    });
  });

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('.modal__close')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
  }

  /* ---------------------------------------------------------------------
     Forms — validation, submit, WhatsApp fallback
     --------------------------------------------------------------------- */
  function setError(field, message) {
    field.classList.add('field--error');
    var err = $('.field__err', field);
    if (err) err.textContent = message;
  }

  function clearError(field) {
    field.classList.remove('field--error');
  }

  function validate(form) {
    var ok = true;

    $$('.field', form).forEach(function (field) {
      var input = $('input, select, textarea', field);
      if (!input || !input.required) return;

      var value = (input.value || '').trim();
      clearError(field);

      if (!value) {
        setError(field, 'This field is required.');
        ok = false;
        return;
      }
      if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        setError(field, 'Enter a valid email address.');
        ok = false;
        return;
      }
      if (input.type === 'tel') {
        var digits = value.replace(/\D/g, '');
        if (digits.length < 10) {
          setError(field, 'Enter a valid 10-digit mobile number.');
          ok = false;
        }
      }
    });

    var consent = $('.consent input[required]', form);
    if (consent && !consent.checked) {
      var status = $('.form-status', form);
      if (status) {
        status.className = 'form-status is-err';
        status.textContent = 'Please accept the consent notice so we can contact you.';
      }
      ok = false;
    }

    return ok;
  }

  function toWhatsApp(form) {
    var data = new FormData(form);
    var lines = ['Enquiry from the Devtaa Developers website', ''];
    var labels = {
      name: 'Name', phone: 'Mobile', email: 'Email',
      project: 'Project', config: 'Configuration',
      budget: 'Budget', message: 'Message', society: 'Society / location'
    };
    Object.keys(labels).forEach(function (k) {
      var v = data.get(k);
      if (v && String(v).trim()) lines.push(labels[k] + ': ' + v);
    });
    var url = 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));
    window.open(url, '_blank', 'noopener');
  }

  $$('form[data-enquiry-form]').forEach(function (form) {
    var status = $('.form-status', form);

    $$('input, select, textarea', form).forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field) clearError(field);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (status) { status.className = 'form-status'; status.textContent = ''; }

      // Bot trap — a filled hidden field means it is not a human.
      var trap = $('.honeypot input', form);
      if (trap && trap.value) return;

      if (!validate(form)) return;

      var btn = $('button[type=submit]', form);
      var original = btn ? btn.textContent : '';

      if (!cfg.formEndpoint) {
        toWhatsApp(form);
        if (status) {
          status.className = 'form-status is-ok';
          status.textContent = 'Opening WhatsApp with your details — press send and our team will call you back.';
        }
        form.reset();
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

      fetch(cfg.formEndpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Bad response');
          if (status) {
            status.className = 'form-status is-ok';
            status.textContent = 'Thank you. Our sales team will call you back within one working day.';
          }
          form.reset();
        })
        .catch(function () {
          if (status) {
            status.className = 'form-status is-err';
            status.textContent = 'Could not send just now. Opening WhatsApp instead…';
          }
          toWhatsApp(form);
        })
        .then(function () {
          if (btn) { btn.disabled = false; btn.textContent = original; }
        });
    });
  });

  /* ---------------------------------------------------------------------
     Fill phone / WhatsApp links from config
     --------------------------------------------------------------------- */
  $$('[data-phone-text]').forEach(function (el) { el.textContent = cfg.phone; });
  $$('[data-phone-link]').forEach(function (el) { el.setAttribute('href', 'tel:' + cfg.phoneTel); });
  $$('[data-wa-link]').forEach(function (el) {
    var msg = el.getAttribute('data-wa-message') || 'Hello Devtaa Developers, I would like to know more about your projects.';
    el.setAttribute('href', 'https://wa.me/' + cfg.whatsapp + '?text=' + encodeURIComponent(msg));
  });

  /* ---------------------------------------------------------------------
     Mark the current page in the nav
     --------------------------------------------------------------------- */
  var here = location.pathname.split('/').pop() || 'index.html';
  $$('.nav__link').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === here) a.classList.add('is-active');
  });

  /* ---------------------------------------------------------------------
     Year in footer
     --------------------------------------------------------------------- */
  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
