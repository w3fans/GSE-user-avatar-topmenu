// Serializes desired state against the SessionManager's acknowledged cookie.
export class InhibitorController {
    constructor(acquire, release, report = console.error) {
        this.acquire = acquire;
        this.release = release;
        this.report = report;
        this.cookie = null;
        this.desired = false;
        this.pending = null;
        this.retryAt = 0;
        this.failures = 0;
    }

    setDesired(desired) {
        if (!this.acquire)
            return;
        if (desired !== this.desired) {
            this.failures = 0;
            this.retryAt = 0;
        }
        this.desired = desired;
        return this.reconcile();
    }

    reconcile() {
        if (this.pending || Date.now() < this.retryAt || this.failures >= 3)
            return this.pending;
        if (Boolean(this.cookie) === this.desired)
            return null;
        this.pending = this._run().finally(() => {
            this.pending = null;
            if (Boolean(this.cookie) !== this.desired && Date.now() >= this.retryAt && this.failures < 3)
                this.reconcile();
        });
        return this.pending;
    }

    async _run() {
        try {
            while (Boolean(this.cookie) !== this.desired) {
                if (this.desired && this.acquire)
                    this.cookie = await this.acquire();
                else {
                    await this.release(this.cookie);
                    this.cookie = null;
                }
            }
            this.failures = 0;
        } catch (error) {
            if (this.failures++ === 0)
                this.report(`Session idle inhibition: ${error.message}`);
            this.retryAt = Date.now() + 5000 * this.failures;
        }
    }

    async destroy() {
        // Acquisition already in flight must finish so its cookie can be freed.
        this.desired = false;
        await this.pending;
        this.acquire = null;
        for (let attempt = 0; this.cookie && attempt < 3; attempt++) {
            try {
                await this.release(this.cookie);
                this.cookie = null;
            } catch (error) {
                if (attempt === 2)
                    this.report(`Could not release idle inhibitor: ${error.message}`);
            }
        }
    }
}
