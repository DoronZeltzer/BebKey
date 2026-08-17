/**
 * City-center coordinates for Israeli cities.
 * Used as fallback for map view when exact listing coordinates are unavailable.
 */
export const CITY_COORDS: Record<string, [number, number]> = {
  'תל אביב יפו':   [32.0853, 34.7818],
  'ירושלים':       [31.7683, 35.2137],
  'חיפה':          [32.7940, 34.9896],
  'ראשון לציון':   [31.9730, 34.8135],
  'פתח תקוה':      [32.0878, 34.8878],
  'אשדוד':         [31.8040, 34.6550],
  'נתניה':         [32.3215, 34.8532],
  'באר שבע':       [31.2530, 34.7915],
  'בני ברק':       [32.0840, 34.8338],
  'חולון':         [32.0128, 34.7799],
  'רמת גן':        [32.0701, 34.8237],
  'גבעתיים':       [32.0697, 34.8118],
  'בת ים':         [32.0218, 34.7509],
  'הרצליה':        [32.1640, 34.8441],
  'רעננה':         [32.1842, 34.8707],
  'כפר סבא':       [32.1789, 34.9078],
  'הוד השרון':     [32.1530, 34.8884],
  'נס ציונה':      [31.9310, 34.7989],
  'יבנה':          [31.8760, 34.7440],
  'בית שמש':       [31.7530, 34.9877],
  'קריית ביאליק':  [32.8322, 35.0750],
  'קריית אתא':     [32.8089, 35.1045],
  'קריית מוצקין':  [32.8370, 35.0782],
  'נהריה':         [33.0042, 35.0956],
  'עכו':           [32.9246, 35.0738],
  'אשקלון':        [31.6688, 34.5742],
  'אילת':          [29.5577, 34.9519],
  'רחובות':        [31.8975, 34.8111],
  'מודיעין':       [31.8946, 35.0099],
  'לוד':           [31.9516, 34.8950],
  'רמלה':          [31.9268, 34.8652],
  'אזור':          [32.0235, 34.8007],
}

/** Returns [lat, lng] for a city, or null if not found. */
export function getCityCoords(city: string | null | undefined): [number, number] | null {
  if (!city) return null
  return CITY_COORDS[city] ?? null
}

/**
 * Deterministic offset based on listing ID so the same listing always
 * appears at the same spot on the map (prevents jitter on re-render).
 * Spread: ±0.008 degrees ≈ ±800m
 */
export function deterministicOffset(id: string): [number, number] {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) & 0x7fffffff
  }
  const lat = ((h & 0xffff) / 0xffff - 0.5) * 0.016
  const lng = (((h >> 16) & 0x7fff) / 0x7fff - 0.5) * 0.016
  return [lat, lng]
}
