package com.weblogbook.vhfradio.service

import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

/** A dedicated handle never presses PTT; dragging the mini bubble never opens it. */
class OverlayDragTouchListener(
    private val touchSlop: Int,
    private val position: () -> Pair<Int, Int>,
    private val stopTalking: () -> Unit,
    private val move: (Int, Int) -> Unit,
    private val save: () -> Unit
) : View.OnTouchListener {
    private var pointer = -1
    private var startX = 0f
    private var startY = 0f
    private var origin = 0 to 0
    private var dragging = false

    override fun onTouch(view: View, event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                stopTalking()
                pointer = event.getPointerId(0)
                origin = position()
                startX = event.rawX; startY = event.rawY; dragging = false
            }
            MotionEvent.ACTION_MOVE -> {
                if (pointer == -1 || event.getPointerId(0) != pointer) return true
                val dx = event.rawX - startX
                val dy = event.rawY - startY
                if (hypot(dx, dy) > touchSlop) dragging = true
                if (dragging) move(origin.first + dx.toInt(), origin.second + dy.toInt())
            }
            MotionEvent.ACTION_UP -> {
                if (pointer != -1) {
                    if (dragging) save() else view.performClick()
                }
                pointer = -1
            }
            MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> {
                if (dragging) save()
                pointer = -1
                stopTalking()
            }
        }
        return true
    }
}
