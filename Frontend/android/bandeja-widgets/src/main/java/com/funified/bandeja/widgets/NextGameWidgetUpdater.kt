package com.funified.bandeja.widgets

import android.content.Context
import androidx.glance.appwidget.updateAll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

object NextGameWidgetUpdater {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutex = Mutex()
    private val running = AtomicBoolean(false)
    private val dirty = AtomicBoolean(false)

    @JvmStatic
    fun requestUpdate(context: Context) {
        val appContext = context.applicationContext
        dirty.set(true)
        if (!running.compareAndSet(false, true)) return
        scope.launch {
            try {
                while (true) {
                    dirty.set(false)
                    delay(64)
                    mutex.withLock {
                        runCatching { NextGameGlanceWidget().updateAll(appContext) }
                    }
                    if (!dirty.get()) break
                }
            } finally {
                running.set(false)
                if (dirty.get()) {
                    requestUpdate(appContext)
                }
            }
        }
    }
}
