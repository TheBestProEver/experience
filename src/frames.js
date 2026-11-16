/* NASA frames that ship with Hearth. Both are public-domain NASA imagery, taken from the NASA WorldWind repository.
   The single-file build replaces the paths below with embedded copies. */
(function (root) { var H = root.Hearth = root.Hearth || {}; H.Frames = { builtin: [
  { id: 'night-2012', title: 'Earth at night, 2012 (Black Marble)', lens: 'lights', projection: 'equirect', src: 'assets/frames/earth-at-night-2012-1024.jpg', hi: 'assets/frames/earth-at-night-2012-2048.jpg', credit: 'NASA Earth Observatory and NOAA NGDC, from Suomi NPP VIIRS data',
    about: 'A cloud-free composite of the whole planet at night in 2012, where the Earth Information Center\u2019s night-lights story begins. Every bright point is a settlement, a road, a fishing fleet or a gas flare. The eastern United States, Europe, India and eastern China blaze; the Sahara, the Amazon, Siberia and the open ocean are almost entirely dark.' },
  { id: 'blue-marble', title: 'Blue Marble: Earth by day', lens: 'auto', projection: 'equirect', src: 'assets/frames/blue-marble-1024.jpg', hi: 'assets/frames/blue-marble-2048.jpg', credit: 'NASA Earth Observatory, Blue Marble Next Generation (Terra MODIS, 2004)',
    about: 'The whole Earth in true colour with the clouds removed, built from months of Terra satellite observations. Deep blue ocean, green forest, tan desert, and white ice at both poles.' }
] }; })(typeof self !== 'undefined' ? self : globalThis);
