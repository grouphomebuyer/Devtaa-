# -*- coding: utf-8 -*-
{
    "name": "Devtaa Developers Website",
    "summary": "Serves the Devtaa Developers marketing website from Odoo and "
               "routes enquiry forms into CRM.",
    "description": """
Devtaa Developers Website
=========================

Publishes the hand-built Devtaa Developers marketing site (static HTML, CSS,
JS and imagery) through Odoo, and wires every enquiry form on it to
``/website/form/crm.lead`` so submissions arrive as leads in the CRM pipeline.

The controller injects Odoo's CSRF token into each page at render time, which
is what allows a plain static form to post into Odoo safely.

Pages served
------------
* ``/`` and ``/home`` — homepage
* ``/projects``, ``/projects/<slug>`` — project listing and detail
* ``/about``, ``/sustainability``, ``/media``, ``/contact``

Assets live under ``/devtaa_website/static/site/`` and can be replaced without
touching Python.
""",
    "version": "17.0.1.0.0",
    "category": "Website",
    "author": "Devtaa Developers",
    "website": "https://www.devtaadevelopers.com",
    "license": "LGPL-3",
    "depends": ["website", "website_crm"],
    "data": [],
    "installable": True,
    "application": True,
    "auto_install": False,
}
