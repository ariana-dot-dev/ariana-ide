import { Command } from "../scripting/baseScript";

export class Subscribeable<T> {
    innerValue: T;
    subscribers: Map<string, (value: T) => void> = new Map<string, (value: T) => void>();

    constructor(initialValue: T) {
        this.innerValue = initialValue;
    }

    set value(v : T) {
        this.innerValue = v;
        this.notifySubscribers(v);
    }

    get value() : T {
        return this.innerValue;
    }

    subscribe(subscriber: (value: T) => void): string {
        let randomUUID = crypto.randomUUID();
        this.subscribers.set(randomUUID, subscriber);
        return randomUUID;
    }

    unsubscribe(subscriberId: string) {
        this.subscribers.delete(subscriberId);
    }

    private notifySubscribers(value: T) {
        this.subscribers.forEach(s => s(value));
    }
}

export class State {
    public showOnboarding: Subscribeable<boolean> = new Subscribeable(false);
    public currentInterpreterScript: Subscribeable<string> = new Subscribeable("");
    public currentTheme: Subscribeable<string> = new Subscribeable("semi-sky");

    processedCommandsStack: Command[] = [];

    processCommand(command: Command) {
        if (command.$type === "Onboarding:show") {
            this.showOnboarding.value = true;
        }
        if (command.$type === "Onboarding:hide") {
            this.showOnboarding.value = false;
        }
        if (command.$type === "Theme:set") {
            this.currentTheme.value = command.themeName;
        }
        
        this.processedCommandsStack.push(command);
    }

    revertCommand() {
        if (this.processedCommandsStack.length === 0) {
            return;
        }
        
        const command = this.processedCommandsStack.pop()!;
        if (command.$type === "Onboarding:show") {
            this.showOnboarding.value = false;
        }
        if (command.$type === "Onboarding:hide") {
            this.showOnboarding.value = true;
        }
        if (command.$type === "Theme:set") {
            // Find the previous theme command or default to "dark-red"
            let previousTheme = "semi-sky";
            for (let i = this.processedCommandsStack.length - 1; i >= 0; i--) {
                const prevCommand = this.processedCommandsStack[i];
                if (prevCommand.$type === "Theme:set") {
                    previousTheme = prevCommand.themeName;
                    break;
                }
            }
            this.currentTheme.value = previousTheme;
        }
    }
}