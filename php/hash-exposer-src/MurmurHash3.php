<?php

namespace LaunchDarkly\HashValueExposer;

/**
 * MurmurHash3 32-bit implementation
 * This implementation matches the algorithm used by LaunchDarkly for bucketing
 */
class MurmurHash3
{
    /**
     * Computes MurmurHash3 32-bit hash
     * 
     * @param string $key Input string to hash
     * @param int $seed Hash seed (default: 0)
     * @return int 32-bit signed integer hash value
     */
    public static function hash(string $key, int $seed = 0): int
    {
        // Convert string to UTF-8 bytes (1-indexed array in PHP)
        $bytes = unpack('C*', $key);
        $len = strlen($key);
        
        $h1 = $seed;
        $c1 = 0xcc9e2d51;
        $c2 = 0x1b873593;
        
        // Process 4-byte chunks
        $numBlocks = intval(floor($len / 4));
        
        for ($i = 0; $i < $numBlocks; $i++) {
            $offset = $i * 4 + 1; // +1 because unpack creates 1-indexed array
            
            // Read 4 bytes as little-endian 32-bit integer
            $k1 = ($bytes[$offset] & 0xff) |
                  (($bytes[$offset + 1] & 0xff) << 8) |
                  (($bytes[$offset + 2] & 0xff) << 16) |
                  (($bytes[$offset + 3] & 0xff) << 24);
            
            // Mix k1
            $k1 = self::imul32($k1, $c1);
            $k1 = self::rotl32($k1, 15);
            $k1 = self::imul32($k1, $c2);
            
            // Mix h1
            $h1 ^= $k1;
            $h1 = self::rotl32($h1, 13);
            $h1 = self::imul32($h1, 5) + 0xe6546b64;
        }
        
        // Process remaining bytes (1-3 bytes)
        $remaining = $len % 4;
        if ($remaining > 0) {
            $k1 = 0;
            $offset = $numBlocks * 4 + 1; // +1 because unpack creates 1-indexed array
            
            if ($remaining >= 3) {
                $k1 ^= ($bytes[$offset + 2] & 0xff) << 16;
            }
            if ($remaining >= 2) {
                $k1 ^= ($bytes[$offset + 1] & 0xff) << 8;
            }
            if ($remaining >= 1) {
                $k1 ^= ($bytes[$offset] & 0xff);
            }
            
            $k1 = self::imul32($k1, $c1);
            $k1 = self::rotl32($k1, 15);
            $k1 = self::imul32($k1, $c2);
            $h1 ^= $k1;
        }
        
        // Finalization
        $h1 ^= $len;
        
        // fmix32
        $h1 ^= self::urshift($h1, 16);
        $h1 = self::imul32($h1, 0x85ebca6b);
        $h1 ^= self::urshift($h1, 13);
        $h1 = self::imul32($h1, 0xc2b2ae35);
        $h1 ^= self::urshift($h1, 16);
        
        // Convert to signed 32-bit integer
        return self::toInt32($h1);
    }
    
    /**
     * 32-bit integer multiplication (handles overflow correctly)
     * 
     * @param int $a First operand
     * @param int $b Second operand
     * @return int 32-bit result
     */
    private static function imul32(int $a, int $b): int
    {
        // Ensure inputs are 32-bit
        $a = self::toInt32($a);
        $b = self::toInt32($b);
        
        // Convert to unsigned for multiplication
        $a_unsigned = $a & 0xffffffff;
        $b_unsigned = $b & 0xffffffff;
        
        // Perform multiplication with proper masking
        $ah = ($a_unsigned >> 16) & 0xffff;
        $al = $a_unsigned & 0xffff;
        $bh = ($b_unsigned >> 16) & 0xffff;
        $bl = $b_unsigned & 0xffff;
        
        // Calculate result in parts to avoid overflow
        $low = $al * $bl;
        $mid = ($ah * $bl + $al * $bh) & 0xffffffff;
        $result = ($low + ($mid << 16)) & 0xffffffff;
        
        // Convert to signed 32-bit integer
        return self::toInt32($result);
    }
    
    /**
     * Rotate left 32-bit operation
     * 
     * @param int $x Value to rotate
     * @param int $r Number of bits to rotate
     * @return int Rotated value
     */
    private static function rotl32(int $x, int $r): int
    {
        $x = self::toInt32($x);
        $left = ($x << $r) & 0xffffffff;
        $right = self::urshift($x, (32 - $r));
        return self::toInt32($left | $right);
    }
    
    /**
     * Unsigned right shift
     * 
     * @param int $x Value to shift
     * @param int $n Number of bits to shift
     * @return int Shifted value
     */
    private static function urshift(int $x, int $n): int
    {
        if ($n === 0) {
            return $x;
        }
        
        // Ensure we're working with unsigned 32-bit value
        $x = $x & 0xffffffff;
        return $x >> $n;
    }
    
    /**
     * Convert to signed 32-bit integer
     * 
     * @param int $x Value to convert
     * @return int 32-bit signed integer
     */
    private static function toInt32(int $x): int
    {
        // Ensure we're working with 32-bit values
        $x = $x & 0xffffffff;
        
        // Convert to signed
        if ($x >= 0x80000000) {
            return $x - 0x100000000;
        }
        
        return $x;
    }
}
