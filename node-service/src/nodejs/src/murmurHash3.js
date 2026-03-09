/**
 * MurmurHash3 32-bit implementation
 * This implementation matches the algorithm used by LaunchDarkly for bucketing
 */

/**
 * Computes MurmurHash3 32-bit hash
 * @param {string} key - Input string to hash
 * @param {number} seed - Hash seed (default: 0)
 * @returns {number} 32-bit signed integer hash value
 */
export function murmurHash3(key, seed = 0) {
  // Convert string to UTF-8 bytes
  const bytes = new TextEncoder().encode(key);
  const len = bytes.length;
  
  let h1 = seed;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  
  // Process 4-byte chunks
  const numBlocks = Math.floor(len / 4);
  
  for (let i = 0; i < numBlocks; i++) {
    const offset = i * 4;
    
    // Read 4 bytes as little-endian 32-bit integer
    let k1 = (bytes[offset] & 0xff) |
             ((bytes[offset + 1] & 0xff) << 8) |
             ((bytes[offset + 2] & 0xff) << 16) |
             ((bytes[offset + 3] & 0xff) << 24);
    
    // Mix k1
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17); // rotl32(k1, 15)
    k1 = Math.imul(k1, c2);
    
    // Mix h1
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19); // rotl32(h1, 13)
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }
  
  // Process remaining bytes (1-3 bytes)
  const remaining = len % 4;
  if (remaining > 0) {
    let k1 = 0;
    const offset = numBlocks * 4;
    
    if (remaining >= 3) {
      k1 ^= (bytes[offset + 2] & 0xff) << 16;
    }
    if (remaining >= 2) {
      k1 ^= (bytes[offset + 1] & 0xff) << 8;
    }
    if (remaining >= 1) {
      k1 ^= (bytes[offset] & 0xff);
    }
    
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17); // rotl32(k1, 15)
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }
  
  // Finalization
  h1 ^= len;
  
  // fmix32
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  
  // Convert to signed 32-bit integer
  return h1 | 0;
}
