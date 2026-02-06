/**
 * Debounce a function so it only runs once the caller stops calling it
 * for `wait` milliseconds. Returns a wrapped version exposing `.cancel()`
 * to abort a pending invocation.
 */
export function debounce(fn, wait = 250) {
    let handle = null;

    function debounced(...args) {
        if (handle !== null) {
            clearTimeout(handle);
        }
        handle = setTimeout(() => {
            handle = null;
            fn.apply(this, args);
        }, wait);
    }

    debounced.cancel = () => {
        if (handle !== null) {
            clearTimeout(handle);
            handle = null;
        }
    };

    return debounced;
}
