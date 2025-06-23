// <hide>
export type Command =
	| {
			$type: "Onboarding:hide";
	  }
	| {
			$type: "Onboarding:show";
	  }
	| {
			$type: "Theme:set";
			themeName: string;
	  };

let __result: Command[] = [];
// </hide>

class Onboarding {
	// <hide>
	static exists: boolean = false;
	// </hide>
	static show(): void {
		// <hide>
		if (Onboarding.exists) {
			throw new Error(
				"Onboarding is already shown hence cannot be shown again",
			);
		}
		__result.push({ $type: "Onboarding:show" });
		Onboarding.exists = true;
	}
	// </hide>
	static hide(): void {
		// <hide>
		if (!Onboarding.exists) {
			throw new Error("Onboarding is not shown hence cannot be hidden");
		}
		__result.push({ $type: "Onboarding:hide" });
		Onboarding.exists = false;
	}
	// </hide>
}

class Theme {
	static set(name: string): void {
		// <hide>
		__result.push({ $type: "Theme:set", themeName: name });
	}
	// </hide>
}

// <initial>
// </initial>
