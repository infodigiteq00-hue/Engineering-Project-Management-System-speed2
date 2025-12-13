/**
 * Cache utility for storing and retrieving data with expiration
 * Uses localStorage for persistence across sessions
 * Includes smart size management and cleanup to prevent quota exceeded errors
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  keyPrefix?: string; // Prefix for cache keys
  maxSize?: number; // Maximum size in bytes for this entry (default: 2MB)
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default
const CACHE_PREFIX = 'epms_cache_';
const MAX_ENTRY_SIZE = 2 * 1024 * 1024; // 2MB per entry default
const MAX_TOTAL_CACHE_SIZE = 8 * 1024 * 1024; // 8MB total cache limit (leaves room for other localStorage)

/**
 * Generate cache key with prefix
 */
const getCacheKey = (key: string, prefix?: string): string => {
  return `${prefix || CACHE_PREFIX}${key}`;
};

/**
 * Get size of a string in bytes
 */
const getStringSize = (str: string): number => {
  return new Blob([str]).size;
};

/**
 * Get total size of all cache entries
 */
const getTotalCacheSize = (prefix: string = CACHE_PREFIX): number => {
  let totalSize = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += getStringSize(value);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to calculate cache size:', error);
  }
  return totalSize;
};

/**
 * Clean up expired and old cache entries to free up space
 * Preserves critical caches and recently accessed caches
 */
const cleanupCache = (prefix: string = CACHE_PREFIX, targetSize?: number): void => {
  try {
    const now = Date.now();
    const cacheEntries: Array<{ key: string; size: number; expiresAt: number; timestamp: number }> = [];
    const keysToRemove: string[] = [];

    // Critical cache patterns to preserve (never evict during cleanup)
    const criticalKeyPatterns = [
      CACHE_KEYS.SUMMARY_STATS,
      CACHE_KEYS.TAB_COUNTERS,
      CACHE_KEYS.FIRM_LOGO, // Firm logo - NEVER CLEAR (priority loader)
      `${CACHE_KEYS.EQUIPMENT}_standalone`, // Preserve standalone equipment
      CACHE_KEYS.COMPANY_HIGHLIGHTS_PRODUCTION_KEY_PROGRESS, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_PRODUCTION_ALL_UPDATES, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_DOCUMENTATION, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_TIMELINE, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_MILESTONE, // Company highlights - preserve
    ];

    // First pass: collect all cache entries and remove expired ones
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          // Check if this is a critical cache (never remove)
          const isCritical = criticalKeyPatterns.some(criticalPattern => {
            const fullCriticalKey = getCacheKey(criticalPattern);
            return key === fullCriticalKey || key.includes(criticalPattern);
          });
          
          if (isCritical) {
            // Skip critical caches - never remove them
            continue;
          }

          const value = localStorage.getItem(key);
          if (value) {
            const cacheItem: CacheItem<any> = JSON.parse(value);
            const size = getStringSize(value);
            
            // Remove expired entries
            if (now > cacheItem.expiresAt) {
              keysToRemove.push(key);
            } else {
              // Keep track of valid entries
              cacheEntries.push({
                key,
                size,
                expiresAt: cacheItem.expiresAt,
                timestamp: cacheItem.timestamp
              });
            }
          }
        } catch (e) {
          // Invalid cache entry, remove it
          keysToRemove.push(key);
        }
      }
    }

    // Remove expired entries
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // If cleanup needed (target size specified), remove only the oldest 20% of cache entries
    // This keeps 80% of cache intact while freeing space incrementally
    // Strategy: Only remove oldest 20% of entries, keep rest until manually cleared
    if (targetSize !== undefined) {
      const currentSize = cacheEntries.reduce((sum, entry) => sum + entry.size, 0);
      if (currentSize > targetSize) {
        // Sort by timestamp (oldest first) - recently accessed caches have newer timestamps
        cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
        
        // Calculate 20% of entries to remove (only oldest 20%)
        const totalEntries = cacheEntries.length;
        const entriesToRemove = Math.max(1, Math.floor(totalEntries * 0.2)); // At least 1 entry, max 20%
        
        // Preserve recently accessed/updated caches (within last 2 minutes)
        // This prevents evicting caches that were just updated (e.g., after adding progress images)
        const RECENT_ACCESS_THRESHOLD = 2 * 60 * 1000; // 2 minutes
        
        let removedCount = 0;
        for (const entry of cacheEntries) {
          // Only remove up to 20% of entries - keep the rest 80% intact
          if (removedCount >= entriesToRemove) break;
          
          // Double-check: don't remove critical caches
          const isCritical = criticalKeyPatterns.some(criticalPattern => {
            const fullCriticalKey = getCacheKey(criticalPattern);
            return entry.key === fullCriticalKey || entry.key.includes(criticalPattern);
          });
          
          // Preserve recently accessed caches (within last 2 minutes)
          const timeSinceAccess = now - entry.timestamp;
          const isRecentlyAccessed = timeSinceAccess < RECENT_ACCESS_THRESHOLD;
          
          // Only remove if: not critical, not recently accessed, and we haven't hit 20% limit
          if (!isCritical && !isRecentlyAccessed) {
            localStorage.removeItem(entry.key);
            removedCount++;
          }
        }
        
        console.log(`🧹 [Cache] Removed ${removedCount} oldest entries (20% cleanup), kept ${totalEntries - removedCount} entries intact`);
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup cache:', error);
  }
};

/**
 * Set data in cache with expiration and size management
 */
export const setCache = <T>(key: string, data: T, options: CacheOptions = {}): void => {
  try {
    const { ttl = DEFAULT_TTL, maxSize = MAX_ENTRY_SIZE } = options;
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const now = Date.now();
    const expiresAt = now + ttl;

    const cacheItem: CacheItem<T> = {
      data,
      timestamp: now,
      expiresAt,
    };

    const serialized = JSON.stringify(cacheItem);
    const dataSize = getStringSize(serialized);

    // Check if individual entry is too large
    if (dataSize > maxSize) {
      console.warn(`⚠️ Cache entry too large (${(dataSize / 1024 / 1024).toFixed(2)}MB), not caching. Key: ${cacheKey}`);
      return;
    }

    // Check total cache size and cleanup if needed
    const currentCacheSize = getTotalCacheSize(options.keyPrefix || CACHE_PREFIX);
    if (currentCacheSize + dataSize > MAX_TOTAL_CACHE_SIZE) {
      // Clean up by removing only oldest 20% of cache entries
      // This keeps 80% of cache intact while freeing space incrementally
      cleanupCache(options.keyPrefix || CACHE_PREFIX, MAX_TOTAL_CACHE_SIZE * 0.95); // Target 95% (remove 20% to get to ~80%)
    }

    // Try to set the cache
    localStorage.setItem(cacheKey, serialized);
  } catch (error: any) {
    // If quota exceeded, try cleanup (remove oldest 20% only)
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      console.warn('⚠️ Storage quota exceeded, cleaning up cache (removing oldest 20%)...');
      cleanupCache(options.keyPrefix || CACHE_PREFIX, MAX_TOTAL_CACHE_SIZE * 0.95); // Remove 20% to get to ~80%
      
      // Try again after cleanup
      try {
        const { ttl = DEFAULT_TTL } = options;
        const cacheKey = getCacheKey(key, options.keyPrefix);
        const now = Date.now();
        const expiresAt = now + ttl;
        const cacheItem: CacheItem<T> = {
          data,
          timestamp: now,
          expiresAt,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      } catch (retryError) {
        console.warn('❌ Still failed after cleanup, cache not saved:', retryError);
      }
    } else {
      console.warn('Failed to set cache:', error);
    }
  }
};

/**
 * Get data from cache if not expired
 * Updates timestamp on access to prevent premature eviction (LRU touch)
 * Returns stale cache if expired (for fallback display)
 */
export const getCache = <T>(key: string, options: CacheOptions = {}, allowStale: boolean = false): T | null => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now > cacheItem.expiresAt) {
      if (allowStale) {
        // Return stale cache as fallback (don't remove it yet)
        return cacheItem.data;
      }
      // Remove expired cache
      localStorage.removeItem(cacheKey);
      return null;
    }

    // CRITICAL FIX: Update timestamp on access (touch) to prevent premature eviction
    // This ensures recently accessed caches aren't considered "old" during cleanup
    const timeSinceCreation = now - cacheItem.timestamp;
    const remainingTTL = cacheItem.expiresAt - now;
    
    // Only update if cache is still valid and we want to preserve it
    // Update timestamp to "now" but keep the same expiration time
    if (remainingTTL > 0) {
      try {
        const updatedCacheItem: CacheItem<T> = {
          ...cacheItem,
          timestamp: now, // Touch: mark as recently accessed
        };
        localStorage.setItem(cacheKey, JSON.stringify(updatedCacheItem));
      } catch (touchError) {
        // If touch fails (e.g., quota exceeded), just return the data
        // Don't fail the entire getCache operation
      }
    }

    return cacheItem.data;
  } catch (error) {
    console.warn('Failed to get cache:', error);
    return null;
  }
};

/**
 * Check if cache exists and is valid
 */
export const hasCache = (key: string, options: CacheOptions = {}): boolean => {
  const cached = getCache(key, options);
  return cached !== null;
};

/**
 * Remove specific cache item
 */
export const removeCache = (key: string, options: CacheOptions = {}): void => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to remove cache:', error);
  }
};

/**
 * Update cache by removing a specific item from an array cache
 * This is for incremental updates - removes one item without clearing entire cache
 */
export const updateCacheRemoveItem = <T extends { id?: string }>(
  key: string,
  itemId: string,
  options: CacheOptions = {}
): void => {
  try {
    const cached = getCache<T[]>(key, options);
    if (cached && Array.isArray(cached)) {
      const updated = cached.filter((item: T) => item.id !== itemId);
      setCache(key, updated, options);
      console.log(`🔄 [Cache] Removed item ${itemId} from cache ${key}, kept ${updated.length} items`);
    }
  } catch (error) {
    console.warn('Failed to update cache (remove item):', error);
  }
};

/**
 * Update cache by adding or updating a specific item in an array cache
 * This is for incremental updates - adds/updates one item without clearing entire cache
 */
export const updateCacheUpsertItem = <T extends { id?: string }>(
  key: string,
  item: T,
  options: CacheOptions = {}
): void => {
  try {
    const cached = getCache<T[]>(key, options);
    if (cached && Array.isArray(cached)) {
      const existingIndex = cached.findIndex((cachedItem: T) => cachedItem.id === item.id);
      let updated: T[];
      
      if (existingIndex >= 0) {
        // Update existing item
        updated = [...cached];
        updated[existingIndex] = item;
        console.log(`🔄 [Cache] Updated item ${item.id} in cache ${key}`);
      } else {
        // Add new item (at the beginning to keep recent items first)
        updated = [item, ...cached];
        console.log(`🔄 [Cache] Added item ${item.id} to cache ${key}`);
      }
      
      setCache(key, updated, options);
    } else {
      // No cache exists, create new with this item
      setCache(key, [item], options);
      console.log(`🔄 [Cache] Created new cache ${key} with item ${item.id}`);
    }
  } catch (error) {
    console.warn('Failed to update cache (upsert item):', error);
  }
};

/**
 * Clear all cache items with the prefix, but preserve critical caches
 * Critical caches (never cleared):
 * - SUMMARY_STATS (main tabs counter, summary cards)
 * - EQUIPMENT_standalone (standalone equipment cache)
 */
export const clearCache = (prefix?: string): void => {
  try {
    const cachePrefix = prefix || CACHE_PREFIX;
    const keysToRemove: string[] = [];
    
    // Critical cache keys to preserve (never clear)
    const criticalKeyPatterns = [
      CACHE_KEYS.SUMMARY_STATS,
      CACHE_KEYS.TAB_COUNTERS, // Tab counters - NEVER CLEAR
      CACHE_KEYS.FIRM_LOGO, // Firm logo - NEVER CLEAR (priority loader)
      `${CACHE_KEYS.EQUIPMENT}_standalone`, // Preserve standalone equipment cache
      CACHE_KEYS.COMPANY_HIGHLIGHTS_PRODUCTION_KEY_PROGRESS, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_PRODUCTION_ALL_UPDATES, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_DOCUMENTATION, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_TIMELINE, // Company highlights - preserve
      CACHE_KEYS.COMPANY_HIGHLIGHTS_MILESTONE, // Company highlights - preserve
    ];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(cachePrefix)) {
        // Check if this is a critical cache key
        const isCritical = criticalKeyPatterns.some(criticalPattern => {
          const fullCriticalKey = getCacheKey(criticalPattern);
          return key === fullCriticalKey || key.includes(criticalPattern);
        });
        
        // Only remove non-critical caches
        if (!isCritical) {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`🧹 [Cache] Cleared ${keysToRemove.length} cache entries (preserved critical caches)`);
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
};

/**
 * Get cache age in milliseconds
 */
export const getCacheAge = (key: string, options: CacheOptions = {}): number | null => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<any> = JSON.parse(cached);
    return Date.now() - cacheItem.timestamp;
  } catch (error) {
    return null;
  }
};

/**
 * Cache keys constants
 */
export const CACHE_KEYS = {
  SUMMARY_STATS: 'summary_stats', // Active projects count, total equipment count
  PROJECT_CARDS: 'project_cards', // Project cards metadata (main overview page)
  EQUIPMENT: 'equipment', // Per-project equipment data (prefix, will append projectId)
  TAB_COUNTERS: 'tab_counters', // Tab counters (Projects, Standalone Equipment, Completion Certificates) - NEVER CLEAR
  FIRM_LOGO: 'firm_logo', // Company logo URL - NEVER CLEAR (priority loader)
  COMPANY_HIGHLIGHTS_PRODUCTION_KEY_PROGRESS: 'company_highlights_production_key_progress', // Production - Key Progress (metadata only, 30 latest)
  COMPANY_HIGHLIGHTS_PRODUCTION_ALL_UPDATES: 'company_highlights_production_all_updates', // Production - All Updates (metadata only, 30 latest)
  COMPANY_HIGHLIGHTS_DOCUMENTATION: 'company_highlights_documentation', // Documentation (metadata only, 30 latest)
  COMPANY_HIGHLIGHTS_TIMELINE: 'company_highlights_timeline', // Timeline (metadata only, 30 latest)
  COMPANY_HIGHLIGHTS_MILESTONE: 'company_highlights_milestone', // Milestone (metadata only, 30 latest)
} as const;

/**
 * Initialize cache cleanup on app startup
 * Call this once when the app loads
 */
export const initializeCacheCleanup = (): void => {
  // Clean up expired entries on startup
  cleanupCache();
  console.log('🧹 [Cache] Initialized cache cleanup');
};

/**
 * Prefetch data with caching
 * Returns cached data if available and fresh, otherwise fetches and caches new data
 * CRITICAL FIX: Always shows cached data (even if stale) until fresh data arrives
 * This prevents empty displays when cache expires or fetch fails
 */
export const prefetchWithCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> => {
  // Try to get from cache first (including stale cache for fallback)
  const cached = getCache<T>(key, options, false); // Try fresh cache first
  const staleCached = cached === null ? getCache<T>(key, options, true) : null; // Fallback to stale cache
  
  if (cached !== null) {
    // Return fresh cached data immediately
    // Then fetch fresh data in background (fire and forget)
    fetchFn()
      .then(freshData => {
        setCache(key, freshData, options);
      })
      .catch(error => {
        // If background refresh fails, keep showing cached data
        console.warn(`Background refresh failed for ${key}, keeping cached data:`, error);
      });
    
    return cached;
  }
  
  // If we have stale cache, return it immediately while fetching fresh data
  if (staleCached !== null) {
    console.log(`⚠️ Using stale cache for ${key} while fetching fresh data...`);
    // Fetch fresh data in background, but return stale cache immediately
    fetchFn()
      .then(freshData => {
        setCache(key, freshData, options);
      })
      .catch(error => {
        // If fetch fails, keep stale cache (don't remove it)
        console.warn(`Failed to fetch fresh data for ${key}, keeping stale cache:`, error);
      });
    
    return staleCached;
  }

  // No cache at all, fetch fresh data (must succeed or return empty)
  try {
    const freshData = await fetchFn();
    setCache(key, freshData, options);
    return freshData;
  } catch (error) {
    console.error(`Failed to fetch data for ${key}:`, error);
    // Return empty array/object based on expected type to prevent crashes
    // The caller should handle empty data gracefully
    return [] as T;
  }
};

