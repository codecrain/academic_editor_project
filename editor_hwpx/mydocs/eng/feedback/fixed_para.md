In the layout processing of the currently problematic page:
1. When a table appears, rendering the table adds the table height. At this point, temporarily save the paragraph starting point of the table.
2. When a subsequent paragraph appears and its line spacing attribute is 'fixed value', add the next paragraph's line spacing starting from the previously saved y position to a temporary variable (fix_vpos_tmp).
3. Continue adding to fix_vpos_tmp until a paragraph with line spacing attribute 'by character' appears.
4. If the height of fix_vpos_tmp exceeds the table height output in step 1, add it to vpos; otherwise, when the next line spacing attribute 'by character' appears, render the paragraph after the table height.
