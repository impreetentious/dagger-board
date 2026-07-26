# Normal CDF And Quantile Notes

The normal quantile implementation is Acklam's three-region rational
approximation using the pinned breakpoints `0.02425` and `0.97575`, followed by
one Halley correction. The original page is no longer reliably live, so this
note pins the archival source location and coefficient family rather than
silently substituting a different approximation.

The implementation checks `Φ(Φ⁻¹(p))` over `[1e-12, 1 − 1e-12]`; the contract's
`1.2e-9` tolerance remains deliberately looser than the documented Acklam
approximation bound, and the Halley step improves the practical result.

Pinned source: Peter J. Acklam, [archived inverse-normal notes](https://web.archive.org/web/20151030215612/http://home.online.no/~pjacklam/notes/invnorm/).
The U.S. Geological Survey's implementation note also records the algorithm's
reported relative-error bound and the three-region rational structure:
[USGS TM 11-C3](https://pubs.usgs.gov/tm/11c3/pdf/T%26M11C3.pdf).
