# Task 41: Clipboard Table Paste File Corruption After Save Fix

## Background
After pasting HTML table and saving as HWP, Hancom shows corruption error. 9 differences identified (DIFF-1~9).

## Goal
Improve Table control quality in `parse_table_html()` for Hancom compatibility.

## Key Issues: DIFF-1 empty cell spaces (High), DIFF-2 CharShape ID (Medium), DIFF-4 BorderFill ID (Medium), DIFF-5 TABLE attr flags, DIFF-3 ParaShape ID, DIFF-6~9 (Low)
