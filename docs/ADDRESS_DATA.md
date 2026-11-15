# Address data (Bangladesh administrative areas)

The checkout address picker (division → district → upazila/thana) and the
delivery-zone mapping read three reference tables: `GeoDivision`,
`GeoDistrict` and `GeoUpazila`.

## Source and licence

| Item         | Value                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------- |
| Dataset      | [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode)                   |
| Licence      | **MIT** — Copyright (c) 2014 Nuhil Mehdy                                                  |
| Version used | upstream commit `c4b950b5cd2a` (2026-11-12)                                               |
| Contents     | 8 divisions, 64 districts, 495 upazilas, with English and Bengali names and BBS geo codes |

The MIT licence permits use, copying and modification with the copyright
notice kept; this file is that notice. The converted data lives in
`prisma/reference/bd-geo.json` (the `source` block records the commit).

## Our additions: Dhaka Metropolitan thanas

The dataset lists only Dhaka district's five upazilas (Savar, Dhamrai,
Keraniganj, Nawabganj, Dohar); the city itself is one city corporation. So
that city customers can pick their thana, 50 Dhaka Metropolitan thanas were
added under Dhaka district with kind `METRO_THANA` and our own stable ids
`dhk-metro-01` … `dhk-metro-50` (list approved by the owner on 2026-11-15; to
be matched with Steadfast's areas in Phase 11).

## Stable ids

| Level              | Id format      | Example                  |
| ------------------ | -------------- | ------------------------ |
| Division           | `div-NN`       | `div-06` Dhaka           |
| District           | `dist-NN`      | `dist-47` Dhaka          |
| Upazila            | `upz-NNN`      | `upz-365` Savar          |
| Metropolitan thana | `dhk-metro-NN` | `dhk-metro-13` Dhanmondi |

Orders store the ids **and** the names (a snapshot), so a later dataset change
never rewrites a past order, and Phase 11 can map ids to courier areas.

## Delivery zones (defaults, editable in the admin)

Lookup order: upazila mapping → district mapping → the default zone.

| Zone            | Rate | Mapped areas                                                                               |
| --------------- | ---- | ------------------------------------------------------------------------------------------ |
| `inside_dhaka`  | ৳70  | the 50 metropolitan thanas; **Dhaka district** itself (so a missing thana never pays more) |
| `dhaka_suburbs` | ৳100 | Dhaka district's 5 upazilas; **Gazipur** and **Narayanganj** districts                     |
| `outside_dhaka` | ৳130 | default — everything else                                                                  |

## Loading

`npm run db:seed-reference` adds whatever is missing (create-only; existing
rows, including admin edits, are never changed). It is safe in every
environment and is also run by the local development seed.
