// Remplace le paquet `server-only` sous Vitest. Le vrai module lève à l'import hors bundle React
// Server Components, ce qui rendait INTESTABLE tout fichier portant le marqueur — y compris des
// modules parfaitement purs comme `lib/ai/client` (politique de repli de modèle), qui ne touchent
// ni next/headers ni Supabase. Le marqueur reste en place pour le build : c'est lui qui garantit
// qu'un import client casse la compilation.
export {}
