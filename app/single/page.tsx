/** @format */

"use client";
import React, { useState, useEffect, useRef } from "react";
import PhotoScreensaver from "../page";

// Updated Types
interface PhotoObject {
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
  __v: number;
  createdAt: string;
  updatedAt: string;
}

const PhotoLoop = () => {
  const [photos, setPhotos] = useState<PhotoObject[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preloadingImages, setPreloadingImages] = useState(false);

  const photosRef = useRef<PhotoObject[]>([]);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const photoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPhotoCountRef = useRef(0);
  const currentPhotoIdRef = useRef<string | null>(null);

  // Simple configuration
  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://dmart-backend-qhdt.onrender.com";
  const refreshInterval = 30000; // 30 seconds
  const totalPhotoDuration = 8000; // 8 seconds total per photo

  // Update refs when photos change
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Preload images utility
  const preloadImages = async (imageSrcs: string[]) => {
    const promises = imageSrcs.map((src) => {
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
      console.warn("Some images failed to preload:", error);
    }
  };

  // Smart index management when photos array updates
  const updatePhotosWithSmartIndex = (newPhotos: PhotoObject[]) => {
    const currentPhoto = photos[currentPhotoIndex];

    if (currentPhoto && newPhotos.length > 0) {
      // Try to find the current photo in the new array
      const currentPhotoNewIndex = newPhotos.findIndex(
        (photo) => photo._id === currentPhoto._id
      );

      if (currentPhotoNewIndex !== -1) {
        // Current photo still exists, continue from there
        setPhotos(newPhotos);
        setCurrentPhotoIndex(currentPhotoNewIndex);
        console.log(
          `Continuing from current photo at new index: ${currentPhotoNewIndex}`
        );
      } else {
        // Current photo no longer exists, start from a smart position
        // If new photos were added, start showing the newer ones
        if (newPhotos.length > lastPhotoCountRef.current) {
          const newPhotosCount = newPhotos.length - lastPhotoCountRef.current;
          const startIndex = Math.max(0, newPhotos.length - newPhotosCount);
          setPhotos(newPhotos);
          setCurrentPhotoIndex(startIndex);
          console.log(
            `New photos detected, starting from index: ${startIndex}`
          );
        } else {
          // No new photos, just continue from current relative position
          const relativeIndex = Math.min(
            currentPhotoIndex,
            newPhotos.length - 1
          );
          setPhotos(newPhotos);
          setCurrentPhotoIndex(relativeIndex);
          console.log(
            `Maintaining relative position at index: ${relativeIndex}`
          );
        }
      }
    } else {
      // No current photo or empty array, start from beginning
      setPhotos(newPhotos);
      setCurrentPhotoIndex(0);
    }

    lastPhotoCountRef.current = newPhotos.length;
  };

  // Alternative approach: Randomize or prioritize recent photos
  const updatePhotosWithRandomStart = (newPhotos: PhotoObject[]) => {
    // Sort by creation date (newest first) and pick a random starting point
    // from the most recent 20% of photos
    const sortedPhotos = [...newPhotos].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const recentCount = Math.max(1, Math.floor(sortedPhotos.length * 0.2));
    const randomStartIndex = Math.floor(Math.random() * recentCount);

    setPhotos(sortedPhotos);
    setCurrentPhotoIndex(randomStartIndex);
    console.log(
      `Starting from random recent photo at index: ${randomStartIndex}`
    );
  };

  // Another approach: Cycle through all photos systematically
  const updatePhotosWithSystematicCycle = (newPhotos: PhotoObject[]) => {
    // Calculate how many photos we've shown since last refresh
    const photosShownSinceRefresh = Math.floor(
      (Date.now() % refreshInterval) / totalPhotoDuration
    );
    const startIndex = photosShownSinceRefresh % newPhotos.length;

    setPhotos(newPhotos);
    setCurrentPhotoIndex(startIndex);
    console.log(`Systematic cycle starting at index: ${startIndex}`);
  };

  // Fetch photos from API
  const fetchPhotos = async () => {
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

      const data = await response.json();

      if (data.success && data.data) {
        console.log(`Fetched ${data.data.length} photos from backend`);
        // Filter only photos with imageUrl (valid photos)
        const validPhotos = data.data.filter(
          (photo: PhotoObject) => photo.imageUrl
        );
        return validPhotos;
      } else {
        throw new Error("Failed to fetch photos: Invalid response format");
      }
    } catch (err) {
      console.error("Error fetching photos:", err);

      // Create placeholder photos for testing with new structure
      const placeholderPhotos: PhotoObject[] = Array.from(
        { length: 10 },
        (_, i) => ({
          _id: `placeholder-${i}`,
          barcode: `00${i + 1}`,
          area: `Area ${i + 1}`,
          bpCode: `80000${i}`,
          bpName: `Test Company ${i + 1}`,
          outletCode: `T1000${i}`,
          outletName: `Test Store ${i + 1}`,
          location: "Western",
          chainInd: "Individual",
          tier: "C",
          headcount: 1,
          award: i % 3 === 0 ? "YES" : "",
          photoId: "5555",
          waNumber: "+94752687114",
          imageUrl: `https://picsum.photos/400/400?random=${i}`,
          waStatus: false,
          isConfirmed: true,
          isWinner: i % 4 === 0,
          restricted: false,
          eventName: "dmart_colombo",
          token: "",
          retailerName: `Retailer ${i + 1}`,
          mobileUpdatedAt: new Date().toISOString(),
          __v: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      return placeholderPhotos;
    }
  };

  // Simple photo loop - just advance to next photo
  const startPhotoLoop = () => {
    if (photos.length === 0) return;

    if (photoTimerRef.current) {
      clearTimeout(photoTimerRef.current);
    }

    photoTimerRef.current = setTimeout(() => {
      setCurrentPhotoIndex((prevIndex) => {
        const nextIndex = prevIndex >= photos.length - 1 ? 0 : prevIndex + 1;
        currentPhotoIdRef.current = photos[nextIndex]?._id || null;
        return nextIndex;
      });
    }, totalPhotoDuration);
  };

  // Handle photo transitions
  useEffect(() => {
    if (photos.length > 0 && !loading && !preloadingImages) {
      startPhotoLoop();
    }

    return () => {
      if (photoTimerRef.current) {
        clearTimeout(photoTimerRef.current);
      }
    };
  }, [currentPhotoIndex, photos.length, loading, preloadingImages]);

  // Initial fetch
  useEffect(() => {
    const initialFetch = async () => {
      try {
        setPreloadingImages(true);
        const fetchedPhotos = await fetchPhotos();

        // Preload all images before setting photos
        const imageSrcs = fetchedPhotos.map(
          (photo: PhotoObject) => photo.imageUrl
        );
        await preloadImages(imageSrcs);

        // For initial load, you can choose your preferred strategy:
        // Option 1: Start from beginning (current behavior)
        setPhotos(fetchedPhotos);
        setCurrentPhotoIndex(0);

        // Option 2: Start from a random recent photo
        // updatePhotosWithRandomStart(fetchedPhotos);

        lastPhotoCountRef.current = fetchedPhotos.length;
      } finally {
        setPreloadingImages(false);
        setLoading(false);
      }
    };

    initialFetch();
  }, []);

  // Periodic refresh of photos with smart index management
  useEffect(() => {
    const setupRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(async () => {
        const newPhotos = await fetchPhotos();

        // Preload new images before updating state
        const newImageSrcs = newPhotos.map(
          (photo: PhotoObject) => photo.imageUrl
        );
        const existingImageSrcs = photosRef.current.map(
          (photo) => photo.imageUrl
        );
        const uniqueNewSrcs = newImageSrcs.filter(
          (src: string) => !existingImageSrcs.includes(src)
        );

        if (uniqueNewSrcs.length > 0) {
          console.log(`Found ${uniqueNewSrcs.length} new images to preload`);
          await preloadImages(uniqueNewSrcs);
        }

        // Choose your preferred update strategy:

        // Option 1: Smart index management (maintains current position when possible)
        updatePhotosWithSmartIndex(newPhotos);

        // Option 2: Random start from recent photos
        // updatePhotosWithRandomStart(newPhotos);

        // Option 3: Systematic cycling
        // updatePhotosWithSystematicCycle(newPhotos);

        // Option 4: Always start from newest photos
        // setPhotos(newPhotos);
        // setCurrentPhotoIndex(Math.max(0, newPhotos.length - 10)); // Start from 10th newest

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
  }, [loading, preloadingImages, photos.length, currentPhotoIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (photoTimerRef.current) {
        clearTimeout(photoTimerRef.current);
      }
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

  const currentPhoto = photos[currentPhotoIndex];

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Photo Container with smooth animation */}
      <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
        <div
          key={currentPhoto._id}
          className="relative max-w-[64vh] max-h-[64vh] animate-photo-cycle aspect-square w-full h-full flex items-center justify-center overflow-hidden"
          style={{
            animation: `photoReveal ${totalPhotoDuration}ms ease-in-out infinite`,
          }}>
          <img
            src={currentPhoto.imageUrl}
            alt={`Photo from ${currentPhoto.outletName} - ${currentPhoto.retailerName}`}
            className="w-full h-full object-cover rounded-lg shadow-2xl"
            style={{
              filter: "drop-shadow(0 0 30px rgba(255, 255, 255, 0.3))",
              objectPosition: "center 15%",
            }}
          />
          <div className=" absolute text-center bottom-0 left-1/2 -translate-x-1/2 z-10 flex flex-col justify-end pb-10  h-32 bg-gradient-to-t from-violet-900 to-transparent w-full rounded-b-md">
            <span className="text-4xl font-semibold drop-shadow-lg text-white">
              {currentPhoto.retailerName}
            </span>
            <span className="text-lg opacity-90 drop-shadow-lg text-white">
              {currentPhoto.outletName}
            </span>
          </div>
        </div>
      </div>

      <div className="z-10 relative">
        <PhotoScreensaver />
      </div>

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes photoReveal {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          15% {
            opacity: 1;
            transform: scale(1);
          }
          85% {
            opacity: 1;
            transform: scale(1.2);
          }
          100% {
            opacity: 0;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
};

export default PhotoLoop;
