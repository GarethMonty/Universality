import { useEffect, useState, type RefObject, type WheelEvent } from 'react'

interface TabStripScrollState {
  canScrollLeft: boolean
  canScrollRight: boolean
}

export function useTabStripScroll(
  stripRef: RefObject<HTMLDivElement | null>,
  dependencyCount: number,
) {
  const [scrollState, setScrollState] = useState<TabStripScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
  })

  useEffect(() => {
    const strip = stripRef.current

    if (!strip) {
      return
    }

    const updateScrollState = () => {
      const maxScrollLeft = strip.scrollWidth - strip.clientWidth
      setScrollState({
        canScrollLeft: strip.scrollLeft > 1,
        canScrollRight: strip.scrollLeft < maxScrollLeft - 1,
      })
    }

    updateScrollState()
    strip.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(strip)

    return () => {
      strip.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [dependencyCount, stripRef])

  const scrollTabs = (direction: 'left' | 'right') => {
    const strip = stripRef.current

    if (!strip) {
      return
    }

    const delta = Math.max(160, Math.floor(strip.clientWidth * 0.55))
    if (strip.scrollBy) {
      strip.scrollBy({
        left: direction === 'left' ? -delta : delta,
        behavior: 'smooth',
      })
    } else {
      strip.scrollLeft += direction === 'left' ? -delta : delta
    }
  }

  const scrollTabsOnWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current

    if (!strip || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    event.preventDefault()
    strip.scrollLeft += event.deltaY
  }

  return { scrollState, scrollTabs, scrollTabsOnWheel }
}
