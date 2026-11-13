package ar.escribe.tablero;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Fija la app en pantalla (screen pinning) para que el chico no pueda salir. */
@CapacitorPlugin(name = "Kiosk")
public class KioskPlugin extends Plugin {

    @PluginMethod
    public void lock(PluginCall call) {
        final Activity act = getActivity();
        act.runOnUiThread(() -> {
            try {
                if (!isLocked()) act.startLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo fijar: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        final Activity act = getActivity();
        act.runOnUiThread(() -> {
            try {
                if (isLocked()) act.stopLockTask();
                call.resolve();
            } catch (Exception e) {
                call.reject("No se pudo desfijar: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("locked", isLocked());
        call.resolve(r);
    }

    private boolean isLocked() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }
}
