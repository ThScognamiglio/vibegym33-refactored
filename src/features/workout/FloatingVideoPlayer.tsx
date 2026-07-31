import React, { useState, useEffect, useRef } from 'react';
import { X, Move } from 'lucide-react';

export const FloatingVideoPlayer: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  useEffect(() => {
    const handlePlayVideo = (e: any) => {
      const url = e.detail;
      setVideoUrl(url);
      
      // Calculate boundaries safely
      const maxX = window.innerWidth - 320;
      const maxY = window.innerHeight - 200;
      
      // Default to bottom right with 20px padding (mobile safe)
      let defaultX = window.innerWidth - 340;
      let defaultY = window.innerHeight - 240;
      
      if (defaultX < 0) defaultX = 10;
      if (defaultY < 0) defaultY = 10;

      setPosition({ x: defaultX, y: defaultY });
    };

    window.addEventListener('play-video', handlePlayVideo);
    return () => window.removeEventListener('play-video', handlePlayVideo);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y
    };
    e.preventDefault();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging || !dragRef.current) return;
    
    let newX = dragRef.current.initialX + (e.clientX - dragRef.current.startX);
    let newY = dragRef.current.initialY + (e.clientY - dragRef.current.startY);

    // Keep within bounds
    const maxX = window.innerWidth - 320; // 320 is widget width
    const maxY = window.innerHeight - 200; // 200 is widget height
    
    if (newX < 0) newX = 0;
    if (newX > maxX) newX = maxX;
    if (newY < 0) newY = 0;
    if (newY > maxY) newY = maxY;

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragRef.current = null;
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    } else {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  if (!videoUrl) return null;

  // Parse Youtube URL to embed format if needed
  let embedUrl = videoUrl;
  if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/')) {
      const videoId = videoUrl.includes('v=') 
          ? videoUrl.split('v=')[1]?.split('&')[0] 
          : videoUrl.split('/').pop()?.split('?')[0];
      if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }

  // Generate an embed fallback for TikTok or others if necessary here,
  // but mostly users use youtube.

  return (
    <div 
        className={`fixed z-[9999] bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-700 touch-none ${isDragging ? 'opacity-80 scale-[0.98] shadow-blue-500/20' : 'opacity-100 scale-100 shadow-black/50'} transition-opacity transition-transform duration-75 ease-out`}
        style={{ 
            width: '320px',
            height: '200px',
            transform: `translate(${position.x}px, ${position.y}px)`,
            left: 0,
            top: 0
        }}
    >
        {/* Drag Handle Bar */}
        <div 
            className="h-8 bg-gray-800 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={handlePointerDown}
        >
            <div className="flex items-center gap-2 text-gray-400">
                <Move className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Video PiP</span>
            </div>
            <button 
                onClick={() => setVideoUrl(null)}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                onPointerDown={(e) => e.stopPropagation()} 
            >
                <X className="w-4 h-4" />
            </button>
        </div>
        
        {/* Video Content */}
        <div className="w-full h-[calc(100%-32px)] bg-black relative">
            {isDragging && <div className="absolute inset-0 z-10"></div>}
            <iframe 
                src={embedUrl}
                className="w-full h-full border-none"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
            ></iframe>
        </div>
    </div>
  );
};
