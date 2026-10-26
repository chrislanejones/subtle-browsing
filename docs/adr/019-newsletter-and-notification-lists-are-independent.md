# ADR-019: Newsletter and notification lists are independent
Date: 2026-10-26   Status: draft

## Context
The 24-rule annoyance list combined promotional forms and push-notification
tools. Users may want to block one while keeping the other.

## Decision
Keep 18 newsletter/promotional rules in annoyances.json and move the six
push-tool rules into notifications.json. Add independent global and site
controls. If stored settings lack notificationRules, inherit the old
annoyanceRules value so an existing user's protection does not disappear.
An explicit saved notification value ends that compatibility fallback.

## Consequences
+ Independent choices with no new upstream list or dependency.
+ Existing enabled annoyance settings and older backups preserve both categories.
- Domain blocking can still disable useful parts of a provider's service.
- Built-in browser permission prompts are not universally suppressed.

## Alternatives rejected
Import a broad annoyance subscription: expands scope and introduces filter-engine
and licensing questions without solving this narrow preference issue.

## Pre-mortem
A formerly specialized vendor becomes a general service provider and its
whole-domain rule breaks legitimate functions. Watch for a rise in site
overrides for one rule and narrow that rule based on reproduced evidence.
