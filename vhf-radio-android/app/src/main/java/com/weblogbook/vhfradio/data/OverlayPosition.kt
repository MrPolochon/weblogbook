package com.weblogbook.vhfradio.data

import kotlin.math.roundToInt

/** Fractions of the available travel, so the whole bubble remains reachable. */
data class OverlayPosition(val horizontal: Float = 0f, val vertical: Float = 0.3f) {
    fun pixels(bounds: OverlayBounds): Pair<Int, Int> =
        (bounds.left + fraction(horizontal) * (bounds.right - bounds.left)).roundToInt() to
            (bounds.top + fraction(vertical) * (bounds.bottom - bounds.top)).roundToInt()

    companion object {
        private fun fraction(value: Float) = if (value.isFinite()) value.coerceIn(0f, 1f) else 0f
        fun fromPixels(x: Int, y: Int, bounds: OverlayBounds, previous: OverlayPosition) = OverlayPosition(
            if (bounds.right > bounds.left) fraction((x - bounds.left).toFloat() / (bounds.right - bounds.left)) else previous.horizontal,
            if (bounds.bottom > bounds.top) fraction((y - bounds.top).toFloat() / (bounds.bottom - bounds.top)) else previous.vertical
        )
    }
}

data class OverlayBounds(val left: Int, val top: Int, val right: Int, val bottom: Int) {
    companion object {
        fun available(width: Int, height: Int, bubbleWidth: Int, bubbleHeight: Int,
                      insetLeft: Int = 0, insetTop: Int = 0, insetRight: Int = 0, insetBottom: Int = 0,
                      margin: Int = 0): OverlayBounds {
            val left = insetLeft + margin
            val top = insetTop + margin
            return OverlayBounds(left, top, (width - insetRight - margin - bubbleWidth).coerceAtLeast(left),
                (height - insetBottom - margin - bubbleHeight).coerceAtLeast(top))
        }
    }
}
