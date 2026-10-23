# Pick the map filters

Type: grilling
Status: resolved
Blocked by: none

## Question

Which filters and search does the map have, and how do they work? The columns are fixed in [Pick the sheet columns](03-excel-columns.md). The user asked for rent, configuration and shortlisted only. Decide each filter's control (range, checkboxes, toggle), whether Rejected listings are hidden by default, whether the budget from the Settings tab sets the default rent limit, and whether there is a text search (society, locality).

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q13). All recommended picks accepted.

- **Money filter (Q1, Q2):** one "max ₹/month" number box. It checks Total monthly cost. If Maintenance is empty, it checks Rent alone.
- **Default max (Q3):** the box starts at the Budget from the Settings tab. Changing the box does not change the sheet.
- **No rent (Q4):** a listing with an empty Rent passes the money filter. Other filters still apply to it.
- **Configuration (Q5):** one checkbox each for 1RK, 1BHK, 2BHK, 3BHK, 4BHK+. All ticked at start.
- **Shortlisted (Q6):** one "Shortlisted only" switch, off at start.
- **Rejected (Q7):** hidden at start. A "Show rejected" switch shows them.
- **Search (Q8):** one box. It matches Society / building name and Locality. Case does not matter.
- **Hidden pins (Q9):** a filtered-out pin disappears from the map.
- **Per person (Q10):** filter picks stay in that person's app. They never go into the sheet.
- **No memory (Q11):** filters reset each time the app opens.
- **Places (Q12):** filters hide listings only. Places always show.
- **Count (Q13):** the filter bar shows "N of M listings shown".
