/** @format */

"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";

interface RetailerData {
  _id: string;
  barcode: string;
  area: string;
  bpCode: string;
  bpName: string;
  outletCode: string;
  outletName: string;
  location: string;
  chainInd: string;
  tier: string;
  headcount: number;
  award: string;
  photoId: string;
  waNumber: string;
  imageUrl: string;
  waStatus: boolean;
  isConfirmed: boolean;
  isWinner: boolean;
  restricted: boolean;
  eventName: string;
  token: string;
  retailerName: string;
  mobileUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  eventName: string;
  data: RetailerData[];
}

interface GridPhoto {
  id: string;
  photoId: string; // Original photo _id
  src: string;
  blobUrl?: string; // URL created from blob
  gridX: number;
  gridY: number;
  rotation: number;
  opacity: number;
  scale: number;
  isVisible: boolean;
  nextTransitionAt: number; // When this photo should transition
  retailerName: string;
  outletName: string;
  area: string;
  tier: string;
  isWinner: boolean;
  award: string;
}

interface GridPosition {
  x: number;
  y: number;
  nextTransitionAt: number;
  active: boolean; // Whether this position is currently active
  distanceFromCenter: number; // Distance from center of grid
  currentPhotoId: string | null; // Track which photo is currently in this position
}

interface GridDimensions {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

interface ImageCache {
  [key: string]: {
    blob: Blob;
    objectUrl: string;
    timestamp: number;
  };
}

export default function PhotoScreensaver() {
  const [photos, setPhotos] = useState<RetailerData[]>([]);
  const [gridPhotos, setGridPhotos] = useState<GridPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [preloadingImages, setPreloadingImages] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [eventName, setEventName] = useState<string>("");
  const [totalCount, setTotalCount] = useState<number>(0);
  const [gridDimensions, setGridDimensions] = useState<GridDimensions>({
    cols: 4,
    rows: 3,
    cellWidth: 300,
    cellHeight: 250,
  });
  const [refreshInterval, setRefreshInterval] = useState<number>(30000); // 30 seconds

  // Use refs to avoid closure issues with timers
  const photosRef = useRef<RetailerData[]>([]);
  const gridPhotosRef = useRef<GridPhoto[]>([]);
  const currentPhotoIndexRef = useRef(0);
  const gridPositionsRef = useRef<GridPosition[]>([]);
  const timerIdsRef = useRef<NodeJS.Timeout[]>([]);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const displayedPhotoIdsRef = useRef<Set<string>>(new Set());
  const imageCacheRef = useRef<ImageCache>({});
  const imagePreloadQueueRef = useRef<Set<string>>(new Set());
  const debugModeRef = useRef<boolean>(false);
  const lastPhotoCountRef = useRef(0);
  const photoOrderingRef = useRef<"chronological" | "newest-first" | "random">(
    "newest-first"
  );

  // Use the provided URL structure for the API
  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
  const FADE_DURATION = 1200; // 1.2 second fade
  const MIN_DISPLAY_TIME = 7000; // 7 seconds minimum display time
  const MAX_DISPLAY_TIME = 12000; // 12 seconds maximum display time
  const MIN_TRANSITION_OFFSET = 2000; // Minimum 2 seconds between transitions
  const MIN_PHOTOS_FOR_FULL_GRID = 200; // Minimum photos needed to fill entire grid
  const CACHE_EXPIRY_TIME = 1000 * 60 * 60; // 1 hour

  // Debug function to log the current state
  const logDebugState = () => {
    if (!debugModeRef.current) return;

    console.log("=== DEBUG STATE ===");
    console.log(`Total photos: ${photosRef.current.length}`);
    console.log(`Event: ${eventName} (${totalCount} total)`);
    console.log(
      `Currently displayed photos: ${displayedPhotoIdsRef.current.size}`
    );
    console.log("Displayed photo IDs:", [...displayedPhotoIdsRef.current]);
    console.log("Grid photos:", gridPhotosRef.current);
    console.log("Grid positions:", gridPositionsRef.current);
    console.log("Photo ordering:", photoOrderingRef.current);
    console.log("===================");
  };

  // Smart photo array management
  const updatePhotosWithSmartManagement = (newPhotos: RetailerData[]) => {
    const currentDisplayedIds = displayedPhotoIdsRef.current;
    const oldPhotos = photosRef.current;

    console.log(`Updating photos: ${oldPhotos.length} → ${newPhotos.length}`);

    // Check if new photos were added
    const newPhotoIds = newPhotos.map((p) => p._id);
    const oldPhotoIds = oldPhotos.map((p) => p._id);
    const addedPhotos = newPhotos.filter((p) => !oldPhotoIds.includes(p._id));

    if (addedPhotos.length > 0) {
      console.log(`${addedPhotos.length} new photos detected`);

      // Strategy 1: Prioritize newest photos
      if (photoOrderingRef.current === "newest-first") {
        const sortedPhotos = [...newPhotos].sort(
          (a, b) =>
            new Date(b.mobileUpdatedAt || b.updatedAt).getTime() -
            new Date(a.mobileUpdatedAt || a.updatedAt).getTime()
        );

        // Reset current index to start showing newer photos
        currentPhotoIndexRef.current = 0;
        console.log("Reordered photos by newest first, reset index to 0");
        return sortedPhotos;
      }

      // Strategy 2: Smart insertion - add new photos to the front of the queue
      else if (photoOrderingRef.current === "chronological") {
        const sortedPhotos = [...newPhotos].sort(
          (a, b) =>
            new Date(a.mobileUpdatedAt || a.updatedAt).getTime() -
            new Date(b.mobileUpdatedAt || b.updatedAt).getTime()
        );
        // Move current index to account for new photos added at the beginning
        const adjustedIndex = Math.min(
          currentPhotoIndexRef.current + addedPhotos.length,
          sortedPhotos.length - 1
        );
        currentPhotoIndexRef.current = adjustedIndex;
        console.log(
          `Adjusted current index to ${adjustedIndex} to account for new photos`
        );
        return sortedPhotos;
      }

      // Strategy 3: Random prioritization of recent photos
      else if (photoOrderingRef.current === "random") {
        const shuffledPhotos = [...newPhotos].sort(() => Math.random() - 0.5);
        currentPhotoIndexRef.current = 0;
        console.log("Randomized photo order, reset index to 0");
        return shuffledPhotos;
      }
    }

    // No new photos or using default strategy
    // Maintain current position if possible
    const currentPhoto = oldPhotos[currentPhotoIndexRef.current];
    if (currentPhoto) {
      const newIndex = newPhotos.findIndex((p) => p._id === currentPhoto._id);
      if (newIndex !== -1) {
        currentPhotoIndexRef.current = newIndex;
        console.log(`Maintained current photo position at index ${newIndex}`);
      } else {
        // Current photo was removed, adjust index
        currentPhotoIndexRef.current = Math.min(
          currentPhotoIndexRef.current,
          newPhotos.length - 1
        );
        console.log(
          `Current photo removed, adjusted index to ${currentPhotoIndexRef.current}`
        );
      }
    }

    return newPhotos;
  };

  // Update photo ordering strategy
  const setPhotoOrdering = (
    strategy: "chronological" | "newest-first" | "random"
  ) => {
    photoOrderingRef.current = strategy;
    console.log(`Photo ordering strategy changed to: ${strategy}`);

    // Immediately reorder current photos
    if (photosRef.current.length > 0) {
      const reorderedPhotos = updatePhotosWithSmartManagement(
        photosRef.current
      );
      setPhotos(reorderedPhotos);
    }
  };

  // Fetch image as blob and store in cache
  const fetchImageAsBlob = async (src: string): Promise<string> => {
    // Check if already in cache and not expired
    const cachedImage = imageCacheRef.current[src];
    const now = Date.now();

    if (cachedImage && now - cachedImage.timestamp < CACHE_EXPIRY_TIME) {
      return cachedImage.objectUrl;
    }

    try {
      // Fetch the image
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image: ${response.status} ${response.statusText}`
        );
      }

      // Convert to blob
      const blob = await response.blob();

      // Create object URL
      const objectUrl = URL.createObjectURL(blob);

      // Store in cache
      imageCacheRef.current[src] = {
        blob,
        objectUrl,
        timestamp: now,
      };

      return objectUrl;
    } catch (error) {
      console.error(`Error fetching image as blob: ${src}`, error);
      // Return original src as fallback
      return src;
    }
  };

  // Clean up expired cache entries and revoke object URLs
  const cleanupImageCache = () => {
    const now = Date.now();
    const cache = imageCacheRef.current;

    Object.keys(cache).forEach((key) => {
      if (now - cache[key].timestamp > CACHE_EXPIRY_TIME) {
        // Revoke the object URL to free memory
        URL.revokeObjectURL(cache[key].objectUrl);
        // Remove from cache
        delete cache[key];
      }
    });
  };

  // Preload a single image as blob
  const preloadImage = async (src: string): Promise<string> => {
    try {
      // Check if already in queue to avoid duplicate processing
      if (imagePreloadQueueRef.current.has(src)) {
        // Wait for it to complete
        while (imagePreloadQueueRef.current.has(src)) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // If it's in the cache now, return it
        if (imageCacheRef.current[src]) {
          return imageCacheRef.current[src].objectUrl;
        }
      }

      // Add to queue
      imagePreloadQueueRef.current.add(src);

      // Fetch and cache the image
      const blobUrl = await fetchImageAsBlob(src);

      // Remove from queue
      imagePreloadQueueRef.current.delete(src);

      return blobUrl;
    } catch (error) {
      console.error(`Error preloading image: ${src}`, error);
      imagePreloadQueueRef.current.delete(src);
      return src; // Return original src as fallback
    }
  };

  // Preload multiple images
  const preloadImages = async (imageSrcs: string[]): Promise<void> => {
    const uniqueSrcs = [...new Set(imageSrcs)];
    const unloadedSrcs = uniqueSrcs.filter(
      (src) => !imageCacheRef.current[src]
    );

    if (unloadedSrcs.length === 0) return;

    console.log(`Preloading ${unloadedSrcs.length} new images...`);
    setPreloadProgress(0);

    // Preload in batches to avoid overwhelming the browser
    const batchSize = 5;
    for (let i = 0; i < unloadedSrcs.length; i += batchSize) {
      const batch = unloadedSrcs.slice(i, i + batchSize);
      await Promise.all(batch.map((src) => preloadImage(src)));

      // Update progress
      setPreloadProgress(
        Math.min(
          100,
          Math.round(((i + batch.length) / unloadedSrcs.length) * 100)
        )
      );
    }

    setPreloadProgress(100);
    console.log("Image preloading complete");

    // Clean up expired cache entries
    cleanupImageCache();
  };

  // Calculate grid dimensions based on screen size
  const calculateGridDimensions = (): GridDimensions => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let cols: number, rows: number;

    if (screenWidth / screenHeight > 1.5) {
      cols = 5;
      rows = 3;
    } else if (screenWidth / screenHeight > 1.2) {
      cols = 4;
      rows = 3;
    } else {
      cols = 3;
      rows = 4;
    }

    const padding = 30;
    const cellWidth = (screenWidth - padding * (cols + 1)) / cols;
    const cellHeight = (screenHeight - padding * (rows + 1)) / rows;

    return { cols, rows, cellWidth, cellHeight };
  };

  // Calculate distance from center of grid
  const calculateDistanceFromCenter = (
    x: number,
    y: number,
    cols: number,
    rows: number
  ): number => {
    const centerX = (cols - 1) / 2;
    const centerY = (rows - 1) / 2;

    // Calculate Euclidean distance
    return Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
  };

  // Update refs when state changes
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    gridPhotosRef.current = gridPhotos;
    // Log debug info whenever grid photos change
    logDebugState();
  }, [gridPhotos]);

  useEffect(() => {
    const updateDimensions = () => {
      setGridDimensions(calculateGridDimensions());
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      // Revoke all object URLs to prevent memory leaks
      Object.values(imageCacheRef.current).forEach((entry) => {
        URL.revokeObjectURL(entry.objectUrl);
      });
    };
  }, []);

  // Enable debug mode and photo ordering controls with keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        debugModeRef.current = !debugModeRef.current;
        console.log(
          `Debug mode ${debugModeRef.current ? "enabled" : "disabled"}`
        );
        if (debugModeRef.current) {
          logDebugState();
        }
      }

      // Photo ordering shortcuts (Ctrl+Shift+1/2/3)
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === "1") {
          setPhotoOrdering("chronological");
        } else if (e.key === "2") {
          setPhotoOrdering("newest-first");
        } else if (e.key === "3") {
          setPhotoOrdering("random");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch photos from API - Updated to use your data structure
  const fetchPhotos = async (): Promise<RetailerData[]> => {
    try {
      console.log(
        "Fetching photos from backend:",
        `${BACKEND_URL}/api/photo-loop`
      );
      const response = await fetch(`${BACKEND_URL}/api/photo-loop`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Backend API error: ${response.status} ${response.statusText}`
        );
      }

      const data: ApiResponse = await response.json();

      if (data.success && data.data) {
        console.log(`Fetched ${data.data.length} retailer photos from backend`);
        setEventName(data.eventName);
        setTotalCount(data.count);

        // Filter out entries without valid images
        const validPhotos = data.data.filter(
          (item) =>
            item.imageUrl &&
            item.imageUrl.trim() !== "" &&
            item.isConfirmed === true &&
            !item.restricted
        );

        console.log(`${validPhotos.length} valid photos after filtering`);
        return validPhotos;
      } else {
        throw new Error("Failed to fetch photos: Invalid response format");
      }
    } catch (err) {
      console.error("Error fetching photos:", err);

      // Create placeholder photos for testing
      const placeholderPhotos: RetailerData[] = Array.from(
        { length: 20 },
        (_, i) => ({
          _id: `placeholder-${i}`,
          barcode: `00${i + 1}`,
          area: `Area ${i + 1}`,
          bpCode: `80000${i}`,
          bpName: `Business Partner ${i + 1}`,
          outletCode: `T10${i}00${i}`,
          outletName: `Outlet ${i + 1}`,
          location:
            i % 3 === 0 ? "Western" : i % 3 === 1 ? "Central" : "Southern",
          chainInd: "Individual",
          tier: i % 2 === 0 ? "A" : "B",
          headcount: 1,
          award: i % 3 === 0 ? "YES" : "",
          photoId: `555${i}`,
          waNumber: `+947${i.toString().padStart(8, "0")}`,
          imageUrl: `/placeholder.svg?height=400&width=400&text=Photo ${i + 1}`,
          waStatus: false,
          isConfirmed: true,
          isWinner: i % 4 === 0,
          restricted: false,
          eventName: "dmart_colombo",
          token: "",
          retailerName: `Retailer ${i + 1}`,
          mobileUpdatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      setEventName("dmart_colombo");
      setTotalCount(placeholderPhotos.length);
      return placeholderPhotos;
    }
  };

  // Initial fetch
  useEffect(() => {
    const initialFetch = async () => {
      try {
        setPreloadingImages(true);
        const fetchedPhotos = await fetchPhotos();

        // Apply initial smart management
        const managedPhotos = updatePhotosWithSmartManagement(fetchedPhotos);

        // Preload all images before setting photos
        const imageSrcs = managedPhotos
          .map((photo: RetailerData) => photo.imageUrl)
          .filter(Boolean);
        if (imageSrcs.length > 0) {
          await preloadImages(imageSrcs);
        }

        setPhotos(managedPhotos);
        lastPhotoCountRef.current = managedPhotos.length;
      } finally {
        setPreloadingImages(false);
        setLoading(false);
      }
    };

    initialFetch();
  }, []);

  // Periodic refresh of photos with smart management
  useEffect(() => {
    const setupRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(async () => {
        const newPhotos = await fetchPhotos();

        // Apply smart photo management
        const managedPhotos = updatePhotosWithSmartManagement(newPhotos);

        // Preload new images before updating state
        const newImageSrcs = managedPhotos
          .map((photo: RetailerData) => photo.imageUrl)
          .filter(Boolean);
        const existingImageSrcs = photosRef.current
          .map((photo) => photo.imageUrl)
          .filter(Boolean);
        const uniqueNewSrcs = newImageSrcs.filter(
          (src: string) => !existingImageSrcs.includes(src)
        );

        if (uniqueNewSrcs.length > 0) {
          console.log(`Found ${uniqueNewSrcs.length} new images to preload`);
          await preloadImages(uniqueNewSrcs);
        }

        setPhotos(managedPhotos);

        // If we have more photos now, activate more grid positions
        if (managedPhotos.length > lastPhotoCountRef.current) {
          activateMoreGridPositions(managedPhotos.length);
        }

        lastPhotoCountRef.current = managedPhotos.length;

        // Set up next refresh
        setupRefreshTimer();
      }, refreshInterval);
    };

    if (!loading && !preloadingImages) {
      setupRefreshTimer();
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [loading, preloadingImages, refreshInterval]);

  // Get random display time
  const getRandomDisplayTime = (): number => {
    return (
      MIN_DISPLAY_TIME + Math.random() * (MAX_DISPLAY_TIME - MIN_DISPLAY_TIME)
    );
  };

  // Create a new grid photo - Updated for new data structure
  const createGridPhoto = async (
    photo: RetailerData,
    gridX: number,
    gridY: number,
    nextTransitionAt: number
  ): Promise<GridPhoto> => {
    const photoSrc = photo.imageUrl;
    // Get or create blob URL
    const blobUrl = await preloadImage(photoSrc);

    return {
      id: Math.random().toString(36).substr(2, 9),
      photoId: photo._id, // Store the original photo ID
      src: photoSrc,
      blobUrl: blobUrl,
      gridX,
      gridY,
      rotation: (Math.random() - 0.5) * 6, // Subtle rotation
      opacity: 0,
      scale: 0.92,
      isVisible: false,
      nextTransitionAt,
      retailerName: photo.retailerName,
      outletName: photo.outletName,
      area: photo.area,
      tier: photo.tier,
      isWinner: photo.isWinner,
      award: photo.award,
    };
  };

  // Animate photo in
  const animatePhotoIn = (photoId: string) => {
    setGridPhotos((prev) =>
      prev.map((p) => {
        if (p.id === photoId) {
          return {
            ...p,
            isVisible: true,
            opacity: 1,
            scale: 1,
          };
        }
        return p;
      })
    );
  };

  // Animate photo out
  const animatePhotoOut = (photoId: string) => {
    // Find the photo before we animate it out
    const photoToRemove = gridPhotosRef.current.find((p) => p.id === photoId);
    if (!photoToRemove) return;

    // Find the grid position for this photo
    const position = gridPositionsRef.current.find(
      (pos) => pos.x === photoToRemove.gridX && pos.y === photoToRemove.gridY
    );

    setGridPhotos((prev) =>
      prev.map((p) => {
        if (p.id === photoId) {
          return {
            ...p,
            opacity: 0,
            scale: 0.85,
          };
        }
        return p;
      })
    );

    // Remove photo after animation completes
    const timerId = setTimeout(() => {
      // Remove from displayed photos set
      if (photoToRemove) {
        displayedPhotoIdsRef.current.delete(photoToRemove.photoId);

        // Clear the current photo from the position
        if (position) {
          position.currentPhotoId = null;
        }

        if (debugModeRef.current) {
          console.log(`Removed photo ${photoToRemove.photoId} from display`);
        }
      }

      // Remove from grid photos
      setGridPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }, FADE_DURATION);

    timerIdsRef.current.push(timerId);
  };

  // Initialize grid positions with staggered transition times
  const initializeGridPositions = () => {
    const positions: GridPosition[] = [];
    const now = Date.now();
    const totalCells = gridDimensions.cols * gridDimensions.rows;
    const photoCount = photosRef.current.length;

    // Create all grid positions with distance from center
    for (let x = 0; x < gridDimensions.cols; x++) {
      for (let y = 0; y < gridDimensions.rows; y++) {
        // Calculate distance from center
        const distanceFromCenter = calculateDistanceFromCenter(
          x,
          y,
          gridDimensions.cols,
          gridDimensions.rows
        );

        // Stagger initial transitions (1-5 seconds from now)
        const initialDelay = 1000 + Math.random() * 4000;
        positions.push({
          x,
          y,
          nextTransitionAt: now + initialDelay,
          active: false, // Will be activated based on distance from center
          distanceFromCenter,
          currentPhotoId: null, // No photo initially
        });
      }
    }

    // Sort positions by distance from center (closest first)
    positions.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);

    // Determine how many positions to activate initially
    // Never activate more positions than we have photos
    const activePositions = Math.min(
      totalCells,
      Math.max(Math.min(photoCount, MIN_PHOTOS_FOR_FULL_GRID), 1)
    );

    // Activate the closest positions to center
    for (let i = 0; i < activePositions; i++) {
      positions[i].active = true;
    }

    // Ensure no transitions are too close to each other
    positions.sort((a, b) => a.nextTransitionAt - b.nextTransitionAt);
    for (let i = 1; i < positions.length; i++) {
      const prevTransition = positions[i - 1].nextTransitionAt;
      const currentTransition = positions[i].nextTransitionAt;

      if (currentTransition - prevTransition < MIN_TRANSITION_OFFSET) {
        positions[i].nextTransitionAt =
          prevTransition + MIN_TRANSITION_OFFSET + Math.random() * 1000;
      }
    }

    return positions;
  };

  // Activate more grid positions when we get more photos
  const activateMoreGridPositions = (newPhotoCount: number) => {
    const positions = gridPositionsRef.current;
    const totalCells = gridDimensions.cols * gridDimensions.rows;
    const currentActiveCount = positions.filter((p) => p.active).length;

    // How many more positions can we activate
    // Never activate more positions than we have photos
    const additionalPositions = Math.min(
      totalCells - currentActiveCount,
      Math.max(newPhotoCount - currentActiveCount, 0),
      Math.max(newPhotoCount - displayedPhotoIdsRef.current.size, 0) // Only activate up to available photos
    );

    if (additionalPositions <= 0) return;

    // Sort inactive positions by distance from center
    const inactivePositions = positions
      .filter((p) => !p.active)
      .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);

    // Activate positions with staggered timing
    for (
      let i = 0;
      i < Math.min(additionalPositions, inactivePositions.length);
      i++
    ) {
      const position = inactivePositions[i];
      position.active = true;
      position.nextTransitionAt = Date.now() + 1000 + i * 500;

      // Start showing photos in this position
      const transitionTimerId = setTimeout(() => {
        transitionPhotoAt(position);
      }, position.nextTransitionAt - Date.now());

      timerIdsRef.current.push(transitionTimerId);
    }
  };

  // Schedule the next transition for a grid position
  const scheduleNextTransition = (position: GridPosition) => {
    const displayTime = getRandomDisplayTime();
    position.nextTransitionAt = Date.now() + displayTime;

    // Ensure this transition doesn't conflict with others
    const allPositions = gridPositionsRef.current;
    allPositions.sort((a, b) => a.nextTransitionAt - b.nextTransitionAt);

    for (let i = 0; i < allPositions.length; i++) {
      if (allPositions[i] === position) {
        // Check if too close to previous transition
        if (
          i > 0 &&
          position.nextTransitionAt - allPositions[i - 1].nextTransitionAt <
            MIN_TRANSITION_OFFSET
        ) {
          position.nextTransitionAt =
            allPositions[i - 1].nextTransitionAt +
            MIN_TRANSITION_OFFSET +
            Math.random() * 1000;
        }

        // Check if too close to next transition
        if (
          i < allPositions.length - 1 &&
          allPositions[i + 1].nextTransitionAt - position.nextTransitionAt <
            MIN_TRANSITION_OFFSET
        ) {
          position.nextTransitionAt =
            allPositions[i + 1].nextTransitionAt -
            MIN_TRANSITION_OFFSET -
            Math.random() * 1000;
        }
        break;
      }
    }

    return position.nextTransitionAt;
  };

  // Enhanced photo selection with smart ordering - Updated for RetailerData
  const getNextPhoto = (): RetailerData | null => {
    const photos = photosRef.current;
    const displayedPhotoIds = displayedPhotoIdsRef.current;

    // If no photos, return null
    if (photos.length === 0) {
      return null;
    }

    // If all photos are currently displayed, allow cycling through again
    // but prioritize newer photos if available
    if (displayedPhotoIds.size >= photos.length) {
      if (debugModeRef.current) {
        console.log("All photos displayed, cycling through again");
      }

      // Clear displayed photos and restart, but prioritize newer ones
      displayedPhotoIdsRef.current.clear();

      // Reset index based on strategy
      if (photoOrderingRef.current === "newest-first") {
        currentPhotoIndexRef.current = 0; // Start with newest
      } else if (photoOrderingRef.current === "random") {
        currentPhotoIndexRef.current = Math.floor(
          Math.random() * photos.length
        );
      }
      // For chronological, keep current position
    }

    // Find a photo that's not currently displayed
    let attempts = 0;
    let nextIndex = currentPhotoIndexRef.current;

    // Try to find a non-displayed photo (with a safety limit of photos.length attempts)
    while (attempts < photos.length) {
      const photo = photos[nextIndex];

      // Check if this photo is already displayed
      if (!displayedPhotoIds.has(photo._id)) {
        // Update the current index for next time
        currentPhotoIndexRef.current = (nextIndex + 1) % photos.length;

        if (debugModeRef.current) {
          console.log(
            `Selected photo ${photo._id} for display (strategy: ${photoOrderingRef.current})`
          );
        }

        return photo;
      }

      // Move to next photo
      nextIndex = (nextIndex + 1) % photos.length;
      attempts++;
    }

    // If we get here, something went wrong with our tracking
    console.error("Failed to find a non-displayed photo despite cycling");
    console.error("Photos count:", photos.length);
    console.error("Displayed photos count:", displayedPhotoIds.size);
    console.error("Displayed photo IDs:", [...displayedPhotoIds]);

    // Emergency fallback - return first photo and clear tracking
    displayedPhotoIdsRef.current.clear();
    currentPhotoIndexRef.current = 0;
    return photos[0] || null;
  };

  // Transition a photo at a specific grid position
  const transitionPhotoAt = async (position: GridPosition) => {
    // Skip if position is not active
    if (!position.active) return;

    // Find if there's already a photo at this position
    const existingPhoto = gridPhotosRef.current.find(
      (p) => p.gridX === position.x && p.gridY === position.y && p.isVisible
    );

    // Get the next photo to display
    const nextPhoto = getNextPhoto();

    // If no photo is available (should not happen with new cycling logic)
    if (nextPhoto === null) {
      const retryDelay = 2000 + Math.random() * 3000; // 2-5 seconds
      const retryTimerId = setTimeout(() => {
        transitionPhotoAt(position);
      }, retryDelay);
      timerIdsRef.current.push(retryTimerId);
      return;
    }

    // Track this photo as being displayed
    displayedPhotoIdsRef.current.add(nextPhoto._id);

    // Update the position to track which photo it's displaying
    position.currentPhotoId = nextPhoto._id;

    // Schedule the next transition time
    const nextTransitionAt = scheduleNextTransition(position);

    // Create new photo with blob URL
    const newPhoto = await createGridPhoto(
      nextPhoto,
      position.x,
      position.y,
      nextTransitionAt
    );

    // Add new photo to state
    setGridPhotos((prev) => [...prev, newPhoto]);

    // Animate in the new photo
    const fadeInTimerId = setTimeout(() => {
      animatePhotoIn(newPhoto.id);
    }, 50);
    timerIdsRef.current.push(fadeInTimerId);

    // If there's an existing photo, animate it out
    if (existingPhoto) {
      const fadeOutTimerId = setTimeout(() => {
        animatePhotoOut(existingPhoto.id);
      }, 100);
      timerIdsRef.current.push(fadeOutTimerId);
    }

    // Schedule the next transition
    const nextTransitionTimerId = setTimeout(() => {
      transitionPhotoAt(position);
    }, nextTransitionAt - Date.now());
    timerIdsRef.current.push(nextTransitionTimerId);
  };

  // Initialize grid and start transitions
  useEffect(() => {
    if (
      photos.length === 0 ||
      gridDimensions.cellWidth === 0 ||
      preloadingImages
    )
      return;

    // Clear any existing timers
    timerIdsRef.current.forEach(clearTimeout);
    timerIdsRef.current = [];

    // Clear tracking sets
    displayedPhotoIdsRef.current.clear();

    // Initialize grid positions with staggered transition times
    const positions = initializeGridPositions();
    gridPositionsRef.current = positions;

    // Initial fill of the grid (only active positions)
    const setupInitialGrid = async () => {
      for (const position of positions.filter((pos) => pos.active)) {
        const photo = getNextPhoto();

        // Skip if no photo available
        if (!photo) continue;

        // Track this photo as being displayed
        displayedPhotoIdsRef.current.add(photo._id);
        position.currentPhotoId = photo._id;

        // Create grid photo with blob URL
        const newPhoto = await createGridPhoto(
          photo,
          position.x,
          position.y,
          position.nextTransitionAt
        );

        setGridPhotos((prev) => [...prev, newPhoto]);

        // Animate in with small delay
        const timerId = setTimeout(() => {
          animatePhotoIn(newPhoto.id);
        }, 50);
        timerIdsRef.current.push(timerId);

        // Schedule first transition
        const transitionTimerId = setTimeout(() => {
          transitionPhotoAt(position);
        }, position.nextTransitionAt - Date.now());
        timerIdsRef.current.push(transitionTimerId);
      }
    };

    setupInitialGrid();

    // Cleanup function
    return () => {
      timerIdsRef.current.forEach(clearTimeout);
      timerIdsRef.current = [];
    };
  }, [photos, gridDimensions, preloadingImages]);

  // Calculate photo style
  const getPhotoStyle = (photo: GridPhoto) => {
    const padding = 30;
    const baseX = padding + photo.gridX * (gridDimensions.cellWidth + padding);
    const baseY = padding + photo.gridY * (gridDimensions.cellHeight + padding);

    // Make photos square by using the smaller dimension
    const maxPhotoSize =
      Math.min(gridDimensions.cellWidth, gridDimensions.cellHeight) * 0.92;
    const photoWidth = maxPhotoSize;
    const photoHeight = maxPhotoSize;

    const centerX = baseX + (gridDimensions.cellWidth - photoWidth) / 2;
    const centerY = baseY + (gridDimensions.cellHeight - photoHeight) / 2;

    return {
      left: `${centerX}px`,
      top: `${centerY}px`,
      width: `${photoWidth}px`,
      height: `${photoHeight}px`,
      transform: `rotate(${photo.rotation}deg) scale(${photo.scale})`,
      opacity: photo.opacity,
      transition: `all ${FADE_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
    };
  };

  if (loading || preloadingImages) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-2xl font-light animate-pulse mb-2">
            {preloadingImages ? "Loading images..." : "Loading..."}
          </div>
          {preloadingImages && (
            <div className="flex flex-col items-center">
              <div className="text-sm text-white/60 mb-2">
                Preparing your photo experience
              </div>
              <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${preloadProgress}%` }}></div>
              </div>
              <div className="text-xs text-white/40 mt-1">
                {preloadProgress}% complete
              </div>
            </div>
          )}
          {eventName && (
            <div className="text-sm text-white/50 mt-4">
              Event: {eventName} ({totalCount} photos)
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 overflow-hidden relative">
      {/* Subtle background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.3),transparent_70%)]" />
      </div>

      {/* Event info */}
      {/* {eventName && (
        <div className="absolute top-4 right-4 text-white text-sm bg-black bg-opacity-50 p-3 rounded z-40">
          <div className="font-medium">{eventName}</div>
          <div className="text-xs text-white/60">{totalCount} participants</div>
        </div>
      )} */}

      {/* Debug info - remove in production */}
      {debugModeRef.current && (
        <div className="absolute top-4 left-4 text-white text-sm bg-black bg-opacity-50 p-3 rounded z-50">
          <div>Photos: {photos.length}</div>
          <div>Displayed: {displayedPhotoIdsRef.current.size}</div>
          <div>Current Index: {currentPhotoIndexRef.current}</div>
          <div>Strategy: {photoOrderingRef.current}</div>
          <div>Event: {eventName}</div>
          <div className="text-xs text-white/60 mt-2">
            Ctrl+Shift+1: Chronological | Ctrl+Shift+2: Newest First |
            Ctrl+Shift+3: Random
          </div>
        </div>
      )}

      {/* Grid photos */}
      {gridPhotos.map((photo) => (
        <div
          key={photo.id}
          className="absolute group"
          style={getPhotoStyle(photo)}>
          <div className="relative w-full h-full rounded-lg overflow-hidden shadow-xl border border-white/10">
            {/* Winner badge */}
            {/* {photo.isWinner && (
              <div className="absolute top-2 right-2 z-10 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                WINNER
              </div>
            )} */}

            {/* Award badge */}
            {/* {photo.award === "YES" && !photo.isWinner && (
              <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
                AWARD
              </div>
            )} */}

            {/* Use blob URL if available, otherwise fall back to original src */}
            {photo.blobUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
               style={{
                  backgroundImage: `url(${photo.blobUrl})`,
                  backgroundPosition: "center 15%", // Use backgroundPosition instead
                }}
              />
            ) : (
              <Image
                src={photo.src || "/placeholder.svg"}
                alt={`Photo of ${photo.retailerName}`}
                fill
                className="object-cover"
                sizes={`${Math.min(
                  gridDimensions.cellWidth,
                  gridDimensions.cellHeight
                )}px`}
                priority={false}
                style={{
                  objectPosition: "center 15%", // This works for Image component
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-white/5" />

            {/* Hover overlay with retailer info */}
            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
              <h3 className="text-white font-medium text-sm truncate">
                {photo.retailerName}
              </h3>
              {photo.outletName && (
                <p className="text-white/80 text-xs truncate">
                  {photo.outletName}
                </p>
              )}
              <div className="flex items-center justify-between mt-1">
                <span className="text-white/60 text-xs">{photo.area}</span>
                <span className="text-white/60 text-xs">Tier {photo.tier}</span>
              </div>
              {debugModeRef.current && (
                <p className="text-red-400 text-xs mt-1 truncate">
                  ID: {photo.photoId}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* No photos message */}
      {photos.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="text-2xl font-light mb-2">No photos available</div>
            <div className="text-white/60">
              Waiting for retailer submissions...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
