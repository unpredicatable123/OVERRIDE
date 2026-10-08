declare global {
	namespace App {
		interface Locals {
			teamId: string | null;
			admin: boolean;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
