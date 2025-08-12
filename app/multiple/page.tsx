"use client"
import React, { useState, useEffect, useRef } from 'react';
import PhotoScreensaver from '../page';

// Types
interface PhotoObject {
  _id: string;
  eventuserdata: {
    ownerNIC: string;
    ownerName: string;
    shopName: string;
    goldenPassNumber: string;
    backgroundMergedImage: string;
    classification: 'GOLD' | 'SILVER';
    selectedBackground: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ActivePhoto {
  photo: PhotoObject;
  id: string;
  position: { x: number; y: number };
  startTime: number;
  cellKey: string;
}

const PhotoLoop = () => {
  const [photos, setPhotos] = useState<PhotoObject[]>([]);
  const [activePhotos, setActivePhotos] = useState<ActivePhoto[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadingImages, setPreloadingImages] = useState(false);
  const [occupiedGridCells, setOccupiedGridCells] = useState<Set<string>>(new Set());

  const photosRef = useRef<PhotoObject[]>([]);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const spawnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Grid configuration
  const gridRows = 4; // 4 rows
  const gridCols = 6; // 6 columns
  const cellPadding = 5; // 5% padding within each cell

  // Configuration
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
  const refreshInterval = 30000; // 30 seconds
  const photoDuration = 8000; // 8 seconds per photo
  const spawnInterval = 3000; // New photo every 3 seconds
  const maxActivePhotos = 3; // Maximum photos on screen at once

  // Update refs when photos change
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Preload images utility
  const preloadImages = async (imageSrcs: string[]) => {
    const promises = imageSrcs.map(src => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });
    });

    try {
      await Promise.all(promises);
      console.log(`Successfully preloaded ${imageSrcs.length} images`);
    } catch (error) {
      console.warn('Some images failed to preload:', error);
    }
  };

  // Fetch photos from API
  const fetchPhotos = async () => {
    try {
      console.log("Fetching photos from backend:", `${BACKEND_URL}/api/photo-loop`);
      const response = await fetch(`${BACKEND_URL}/api/photo-loop`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        console.log(`Fetched ${data.data.length} photos from backend`);
        return data.data;
      } else {
        throw new Error("Failed to fetch photos: Invalid response format");
      }
    } catch (err) {
      console.error("Error fetching photos:", err);

      // Create placeholder photos for testing
      const placeholderPhotos: PhotoObject[] = Array.from({ length: 10 }, (_, i) => ({
        _id: `placeholder-${i}`,
        eventuserdata: {
          ownerNIC: `88139434${i}V`,
          ownerName: `User ${i + 1}`,
          shopName: `Shop ${i + 1}`,
          goldenPassNumber: `034${i}`,
          backgroundMergedImage: `https://picsum.photos/400/400?random=${i}`,
          classification: i % 2 === 0 ? "GOLD" : "SILVER",
          selectedBackground: `/backgrounds/background${i + 1}.png`,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return placeholderPhotos;
    }
  };

  // Generate grid-based position to prevent overlapping
  const generateGridPosition = (excludeActivePositions = true) => {
    const availableCells = [];
    
    // Generate all possible grid positions
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const cellKey = `${row}-${col}`;
        
        // Skip if cell is occupied and we want to exclude active positions
        if (excludeActivePositions && occupiedGridCells.has(cellKey)) {
          continue;
        }
        
        // Calculate cell boundaries
        const cellWidth = 100 / gridCols;
        const cellHeight = 100 / gridRows;
        
        // Calculate center of cell with some random offset within the cell
        const cellCenterX = (col * cellWidth) + (cellWidth / 2);
        const cellCenterY = (row * cellHeight) + (cellHeight / 2);
        
        // Add random offset within cell boundaries (with padding)
        const maxOffsetX = (cellWidth / 2) - cellPadding;
        const maxOffsetY = (cellHeight / 2) - cellPadding;
        
        const randomOffsetX = (Math.random() - 0.5) * maxOffsetX;
        const randomOffsetY = (Math.random() - 0.5) * maxOffsetY;
        
        availableCells.push({
          x: cellCenterX + randomOffsetX,
          y: cellCenterY + randomOffsetY,
          cellKey: cellKey
        });
      }
    }
    
    // If no available cells, clear occupied cells and try again
    if (availableCells.length === 0 && excludeActivePositions) {
      setOccupiedGridCells(new Set());
      return generateGridPosition(false);
    }
    
    // Return random available cell
    const selectedCell = availableCells[Math.floor(Math.random() * availableCells.length)];
    return selectedCell;
  };

  // Spawn a new photo
  const spawnNewPhoto = () => {
    if (photos.length === 0) return;

    const currentPhoto = photos[photoIndex];
    const gridPosition = generateGridPosition();
    
    if (!gridPosition) return; // No available positions
    
    const newActivePhoto: ActivePhoto = {
      photo: currentPhoto,
      id: `${currentPhoto._id}-${Date.now()}-${Math.random()}`,
      position: { x: gridPosition.x, y: gridPosition.y },
      startTime: Date.now(),
      cellKey: gridPosition.cellKey
    };

    setActivePhotos(prev => {
      const updated = [...prev, newActivePhoto];
      return updated.slice(-maxActivePhotos);
    });

    // Mark grid cell as occupied
    setOccupiedGridCells(prev => new Set([...prev, gridPosition.cellKey]));

    // Move to next photo
    setPhotoIndex(prev => (prev + 1) % photos.length);
  };

  // Clean up expired photos
  const cleanupExpiredPhotos = () => {
    const now = Date.now();
    setActivePhotos(prev => {
      const remaining = prev.filter(activePhoto => now - activePhoto.startTime < photoDuration);
      
      // Free up grid cells for photos that are being removed
      const removedPhotos = prev.filter(activePhoto => now - activePhoto.startTime >= photoDuration);
      if (removedPhotos.length > 0) {
        setOccupiedGridCells(current => {
          const updated = new Set(current);
          removedPhotos.forEach(photo => updated.delete(photo.cellKey));
          return updated;
        });
      }
      
      return remaining;
    });
  };

  // Start the photo spawning loop
  const startPhotoLoop = () => {
    if (photos.length === 0) return;

    // Clear existing timers
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);

    // Spawn first photo immediately
    spawnNewPhoto();

    // Set up spawning interval
    const spawnLoop = () => {
      spawnNewPhoto();
      spawnTimerRef.current = setTimeout(spawnLoop, spawnInterval);
    };
    spawnTimerRef.current = setTimeout(spawnLoop, spawnInterval);

    // Set up cleanup interval
    const cleanupLoop = () => {
      cleanupExpiredPhotos();
      cleanupTimerRef.current = setTimeout(cleanupLoop, 1000); // Check every second
    };
    cleanupTimerRef.current = setTimeout(cleanupLoop, 1000);
  };

  // Handle photo lifecycle
  useEffect(() => {
    if (photos.length > 0 && !loading && !preloadingImages) {
      startPhotoLoop();
    }

    return () => {
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, [photos.length, loading, preloadingImages]);

  // Initial fetch
  useEffect(() => {
    const initialFetch = async () => {
      try {
        setPreloadingImages(true);
        const fetchedPhotos = await fetchPhotos();

        // Preload all images before setting photos
        const imageSrcs = fetchedPhotos.map((photo: PhotoObject) => photo.eventuserdata.backgroundMergedImage);
        await preloadImages(imageSrcs);

        setPhotos(fetchedPhotos);
      } finally {
        setPreloadingImages(false);
        setLoading(false);
      }
    };

    initialFetch();
  }, []);

  // Periodic refresh of photos
  useEffect(() => {
    const setupRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(async () => {
        const newPhotos = await fetchPhotos();

        // Preload new images before updating state
        const newImageSrcs = newPhotos.map((photo: PhotoObject) => photo.eventuserdata.backgroundMergedImage);
        const existingImageSrcs = photosRef.current.map((photo) => photo.eventuserdata.backgroundMergedImage);
        const uniqueNewSrcs = newImageSrcs.filter((src: string) => !existingImageSrcs.includes(src));

        if (uniqueNewSrcs.length > 0) {
          console.log(`Found ${uniqueNewSrcs.length} new images to preload`);
          await preloadImages(uniqueNewSrcs);
        }

        setPhotos(newPhotos);
        setPhotoIndex(0); // Reset to first photo when refreshing
        setActivePhotos([]); // Clear active photos
        setOccupiedGridCells(new Set()); // Clear occupied grid cells

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
  }, [loading, preloadingImages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading photos...</div>
      </div>
    );
  }

  if (preloadingImages) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl">Preparing images...</div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl">No photos available</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Multiple Photos Container */}
      <div className="absolute inset-0 z-20">
        {activePhotos.map((activePhoto) => (
          <div
            key={activePhoto.id}
            className="absolute"
            style={{
              left: `${activePhoto.position.x}%`,
              top: `${activePhoto.position.y}%`,
              transform: 'translate(-50%, -50%)',
              animation: `photoReveal ${photoDuration}ms ease-in-out forwards`,
              animationFillMode: 'forwards'
            }}
          >
            <img
              src={activePhoto.photo.eventuserdata.backgroundMergedImage}
              alt={`Photo by ${activePhoto.photo.eventuserdata.ownerName}`}
              className="w-[20vh] h-[20vh] object-cover rounded-lg shadow-2xl"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.3))'
              }}
            />
          </div>
        ))}
      </div>

      <div className='z-10 relative blur-xl'> 
        <PhotoScreensaver />
      </div>

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes photoReveal {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.0);
          }
          85% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(1.3);
          }
        }
      `}</style>
    </div>
  );
};

export default PhotoLoop;
