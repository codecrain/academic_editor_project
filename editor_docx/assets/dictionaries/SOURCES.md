# Academic English wordbook sources

`tlooto-academic-en-US.dic` is a supplemental LibreOffice/Collabora wordbook. It
does not replace or modify Collabora's bundled `en_US` Hunspell dictionary.
The deployment installs it as `share/wordbook/standard.dic`, a reserved name
already present in Collabora's `ActiveDictionaries` configuration. A separate
ownership marker prevents replacement of an unrelated pre-existing file.

The upstream delta was generated from the English Speller Database (ESDB,
formerly SCOWL) at commit `1e5b7d3a72f47a71da5d28686c1dd4b397178485`
using American spelling, size 60, and variant level 1. Only words that the
Collabora Office 26.04.2 bundled base dictionary rejected were retained. A
small reviewed set of academic and AI terminology was then added. See the JSON
manifest beside the wordbook for exact counts and hashes.

Copyright 2000-2026 by Kevin Atkinson

Permission to use, copy, modify, distribute, and sell any part of the English
Speller Database (ESDB, previously known as SCOWLv2), or word lists created
from it, is hereby granted without fee, provided that the above copyright
notice appears in all copies and that both the above copyright notice and this
notice appear in supporting documentation. Kevin Atkinson makes no
representations about the suitability of this database for any purpose. It is
provided "as is" without express or implied warranty.
