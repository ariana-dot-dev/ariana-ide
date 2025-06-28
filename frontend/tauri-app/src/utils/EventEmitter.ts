type EventListener = (...args: any[]) => void;

export class EventEmitter {
	private events: Map<string, EventListener[]> = new Map();

	/**
	 * Add an event listener
	 */
	on(event: string, listener: EventListener): void {
		if (!this.events.has(event)) {
			this.events.set(event, []);
		}
		this.events.get(event)!.push(listener);
	}

	/**
	 * Add a one-time event listener
	 */
	once(event: string, listener: EventListener): void {
		const onceWrapper = (...args: any[]) => {
			listener(...args);
			this.off(event, onceWrapper);
		};
		this.on(event, onceWrapper);
	}

	/**
	 * Remove an event listener
	 */
	off(event: string, listener: EventListener): void {
		const listeners = this.events.get(event);
		if (listeners) {
			const index = listeners.indexOf(listener);
			if (index !== -1) {
				listeners.splice(index, 1);
			}
			// Clean up empty arrays
			if (listeners.length === 0) {
				this.events.delete(event);
			}
		}
	}

	/**
	 * Remove all listeners for an event, or all listeners if no event specified
	 */
	removeAllListeners(event?: string): void {
		if (event) {
			this.events.delete(event);
		} else {
			this.events.clear();
		}
	}

	/**
	 * Emit an event to all listeners
	 */
	emit(event: string, ...args: any[]): void {
		const listeners = this.events.get(event);
		if (listeners) {
			// Create a copy to avoid issues if listeners are modified during emission
			const listenersClone = [...listeners];
			for (const listener of listenersClone) {
				try {
					listener(...args);
				} catch (error) {
					console.error(`Error in event listener for '${event}':`, error);
				}
			}
		}
	}

	/**
	 * Get the number of listeners for an event
	 */
	listenerCount(event: string): number {
		return this.events.get(event)?.length ?? 0;
	}

	/**
	 * Get all event names that have listeners
	 */
	eventNames(): string[] {
		return Array.from(this.events.keys());
	}

	/**
	 * Get all listeners for an event
	 */
	listeners(event: string): EventListener[] {
		return [...(this.events.get(event) ?? [])];
	}
}