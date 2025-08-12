import { NextResponse } from "next/server"

// Mock data for testing - replace with actual API call to your backend
const mockPhotos = [
  {
    _id: "682e0c9dfa36706b409a2331",
    eventuserdata: {
      ownerNIC: "881394340V",
      ownerName: "V. VIJITHAN",
      shopName: "V P N S SUPER MARKET",
      goldenPassNumber: "0347",
      backgroundMergedImage: "/placeholder.svg?height=600&width=400&text=Photo 1",
      classification: "SILVER",
      selectedBackground: "/backgrounds/background3.png",
    },
    createdAt: "2025-05-21T17:25:47.558+00:00",
    updatedAt: "2025-05-21T17:36:04.190+00:00",
  },
  {
    _id: "682e0c9dfa36706b409a2332",
    eventuserdata: {
      ownerNIC: "881394341V",
      ownerName: "SARAH JOHNSON",
      shopName: "SARAH'S BOUTIQUE",
      goldenPassNumber: "0348",
      backgroundMergedImage: "/placeholder.svg?height=600&width=400&text=Photo 2",
      classification: "GOLD",
      selectedBackground: "/backgrounds/background1.png",
    },
    createdAt: "2025-05-21T17:25:47.558+00:00",
    updatedAt: "2025-05-21T17:36:04.190+00:00",
  },
  {
    _id: "682e0c9dfa36706b409a2333",
    eventuserdata: {
      ownerNIC: "881394342V",
      ownerName: "MIKE CHEN",
      shopName: "CHEN'S ELECTRONICS",
      goldenPassNumber: "0349",
      backgroundMergedImage: "/placeholder.svg?height=600&width=400&text=Photo 3",
      classification: "SILVER",
      selectedBackground: "/backgrounds/background2.png",
    },
    createdAt: "2025-05-21T17:25:47.558+00:00",
    updatedAt: "2025-05-21T17:36:04.190+00:00",
  },
]

export async function GET() {
  try {
    // In production, replace this with actual API call to your backend
    // const response = await fetch('http://your-backend-url/api/photo-loop')
    // const data = await response.json()

    // For now, return mock data
    return NextResponse.json({
      success: true,
      message: "All objects retrieved successfully",
      count: mockPhotos.length,
      data: mockPhotos,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching photo-loop data:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch photos",
        message: "Internal server error",
      },
      { status: 500 },
    )
  }
}
