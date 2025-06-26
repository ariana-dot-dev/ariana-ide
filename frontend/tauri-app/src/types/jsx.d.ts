import "react";

declare module "react" {
	interface ButtonHTMLAttributes<T> {
		// Allow any string value for the type attribute
		type?: string;
	}
}
