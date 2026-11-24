package com.weblogbook.vhfradio

import android.content.Context
import android.view.MotionEvent
import android.view.View
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.weblogbook.vhfradio.service.OverlayDragTouchListener
import org.junit.Assert.*
import org.junit.Test

class OverlayGestureTest {
    @Test fun draggingMiniBubbleMovesAndSavesWithoutOpeningOrTransmitting() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val view = View(ApplicationProvider.getApplicationContext<Context>())
            var clicked = 0; var saved = 0; var released = 0
            var position = 30 to 80
            view.setOnClickListener { clicked++ }
            val drag = OverlayDragTouchListener(8, { position }, { released++ }, { x, y -> position = x to y }, { saved++ })
            event(drag, view, MotionEvent.ACTION_DOWN, 10f, 10f)
            event(drag, view, MotionEvent.ACTION_MOVE, 210f, 110f)
            event(drag, view, MotionEvent.ACTION_UP, 210f, 110f)
            assertEquals(230 to 180, position)
            assertEquals(1, released)
            assertEquals(1, saved)
            assertEquals(0, clicked)
        }
    }
    @Test fun tapOpensButCancelledOrMultiTouchGestureNeverDoes() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            val view = View(ApplicationProvider.getApplicationContext<Context>())
            var clicked = 0; var moved = 0
            view.setOnClickListener { clicked++ }
            val drag = OverlayDragTouchListener(8, { 0 to 0 }, {}, { _, _ -> moved++ }, {})
            event(drag, view, MotionEvent.ACTION_DOWN, 10f, 10f)
            event(drag, view, MotionEvent.ACTION_MOVE, 12f, 11f)
            event(drag, view, MotionEvent.ACTION_UP, 12f, 11f)
            assertEquals(1, clicked)
            assertEquals(0, moved)
            for (cancel in listOf(MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN)) {
                event(drag, view, MotionEvent.ACTION_DOWN, 10f, 10f)
                event(drag, view, cancel, 10f, 10f)
                event(drag, view, MotionEvent.ACTION_UP, 10f, 10f)
            }
            assertEquals(1, clicked)
        }
    }
    private fun event(listener: OverlayDragTouchListener, view: View, action: Int, x: Float, y: Float) {
        val event = MotionEvent.obtain(0, 10, action, x, y, 0)
        try { listener.onTouch(view, event) } finally { event.recycle() }
    }
}
