# -*- coding: utf-8 -*-
"""Serves the static Devtaa Developers site from inside Odoo.

Why a controller instead of dropping the files in ``static/``?  Two reasons:

1. Clean URLs — ``/projects`` rather than
   ``/devtaa_website/static/site/projects.html``.
2. The enquiry forms.  Odoo's ``/website/form/<model>`` endpoint rejects a POST
   without a valid CSRF token, and a file served straight off disk cannot carry
   one.  This controller injects ``request.csrf_token()`` and the form endpoint
   into the HTML as it is served, so the same files work both as a plain static
   site and as an Odoo-backed site that creates CRM leads.
"""

import logging
import os

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

SITE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", "site")

# URL path -> file on disk
PAGES = {
    "/": "index.html",
    "/home": "index.html",
    "/about": "about.html",
    "/projects": "projects.html",
    "/sustainability": "sustainability.html",
    "/media": "media.html",
    "/contact": "contact.html",
}

# Project detail pages. Add one entry per project as detail pages are authored;
# every slug currently falls back to the single detail template.
PROJECT_PAGES = {
    "devtaa-aurum": "project-detail.html",
}

# Where enquiry forms post. website_crm exposes this route.
FORM_ENDPOINT = "/website/form/crm.lead"


def _read(filename):
    path = os.path.join(SITE_DIR, filename)
    if not os.path.isfile(path):
        _logger.warning("Devtaa website: missing page file %s", path)
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _render(filename):
    """Return an HTML response for one page of the static site."""
    html = _read(filename)
    if html is None:
        return request.not_found()

    # Point every enquiry form at Odoo and give it a usable CSRF token.
    html = html.replace('data-odoo-endpoint=""', 'data-odoo-endpoint="%s"' % FORM_ENDPOINT)
    html = html.replace(
        '<input type="hidden" name="csrf_token" value="">',
        '<input type="hidden" name="csrf_token" value="%s">' % request.csrf_token(),
    )
    # Relative asset paths resolve against the module's static directory.
    html = html.replace('href="assets/', 'href="/devtaa_website/static/site/assets/')
    html = html.replace('src="assets/', 'src="/devtaa_website/static/site/assets/')

    # Clean URLs: rewrite the .html links the static build emits.
    for path, target in PAGES.items():
        if path in ("/", "/home"):
            continue
        html = html.replace('href="%s"' % target, 'href="%s"' % path)
        html = html.replace('href="%s?' % target, 'href="%s?' % path)
        html = html.replace('href="%s#' % target, 'href="%s#' % path)
    html = html.replace('href="index.html"', 'href="/"')
    html = html.replace('href="project-detail.html"', 'href="/projects/devtaa-aurum"')

    return request.make_response(
        html,
        headers=[("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "public, max-age=300")],
    )


class DevtaaWebsite(http.Controller):

    @http.route(list(PAGES.keys()), type="http", auth="public", website=True, sitemap=True)
    def devtaa_page(self, **kwargs):
        return _render(PAGES[request.httprequest.path.rstrip("/") or "/"])

    @http.route("/projects/<string:slug>", type="http", auth="public", website=True, sitemap=True)
    def devtaa_project(self, slug, **kwargs):
        filename = PROJECT_PAGES.get(slug, "project-detail.html")
        return _render(filename)
