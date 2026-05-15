import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import {
	getAllCoaches,
	getStateByAbbr,
	getStatesWithCoaches,
} from "./utils/coachData";

const palette = {
	graphite900: "#1E1C1E",
	graphite850: "#262326",
	graphite800: "#373537",
	graphite700: "#4E4C4E",
	graphite500: "#6A6965",
	graphite300: "#A8A6A2",
	graphite100: "#C6C5C3",
	text: "#F2F1EF",
	muted: "#A8A6A2",
	border: "rgba(198,197,195,0.14)",
	panel: "rgba(30,28,30,0.88)",
	gold: "rgba(217,189,125,0.88)",
};

const STATE_ABBR_BY_NAME = {
	Alabama: "AL",
	Alaska: "AK",
	Arizona: "AZ",
	Arkansas: "AR",
	California: "CA",
	Colorado: "CO",
	Connecticut: "CT",
	Delaware: "DE",
	Florida: "FL",
	Georgia: "GA",
	Hawaii: "HI",
	Idaho: "ID",
	Illinois: "IL",
	Indiana: "IN",
	Iowa: "IA",
	Kansas: "KS",
	Kentucky: "KY",
	Louisiana: "LA",
	Maine: "ME",
	Maryland: "MD",
	Massachusetts: "MA",
	Michigan: "MI",
	Minnesota: "MN",
	Mississippi: "MS",
	Missouri: "MO",
	Montana: "MT",
	Nebraska: "NE",
	Nevada: "NV",
	"New Hampshire": "NH",
	"New Jersey": "NJ",
	"New Mexico": "NM",
	"New York": "NY",
	"North Carolina": "NC",
	"North Dakota": "ND",
	Ohio: "OH",
	Oklahoma: "OK",
	Oregon: "OR",
	Pennsylvania: "PA",
	"Rhode Island": "RI",
	"South Carolina": "SC",
	"South Dakota": "SD",
	Tennessee: "TN",
	Texas: "TX",
	Utah: "UT",
	Vermont: "VT",
	Virginia: "VA",
	Washington: "WA",
	"West Virginia": "WV",
	Wisconsin: "WI",
	Wyoming: "WY",
};

const STATE_LABEL_COORD_OVERRIDES = {
	Michigan: [43.82, -84.85],
	Florida: [28.05, -81.55],
	Louisiana: [30.88, -91.98],
	Maryland: [39.03, -76.78],
	Delaware: [39.05, -75.48],
	"New Jersey": [40.12, -74.7],
	Massachusetts: [42.22, -71.82],
	Connecticut: [41.62, -72.72],
	"Rhode Island": [41.68, -71.53],
	"New Hampshire": [43.68, -71.58],
	Vermont: [44.05, -72.72],
	Hawaii: [20.78, -156.36],
	Alaska: [64.2, -152.2],
};

const STATE_LABEL_SIZE_OVERRIDES = { Michigan: 0.72, Florida: 0.78 };

const SEMANTIC_SYNONYMS = {
	barbell: [
		"powerlifting",
		"olympic",
		"lifting",
		"strength",
		"squat",
		"bench",
		"deadlift",
		"technique",
	],
	heavy: [
		"powerlifting",
		"strength",
		"barbell",
		"deadlift",
		"squat",
		"olympic",
	],
	lifting: ["powerlifting", "olympic", "strength", "barbell", "technique"],
	lift: ["powerlifting", "olympic", "strength", "barbell"],
	strength: [
		"powerlifting",
		"conditioning",
		"athleticism",
		"resilience",
		"performance",
	],
	power: ["powerlifting", "strength", "barbell"],
	powerlifting: [
		"barbell",
		"squat",
		"bench",
		"deadlift",
		"strength",
		"technique",
	],
	olympic: [
		"weightlifting",
		"barbell",
		"clean",
		"jerk",
		"snatch",
		"technique",
		"lifting",
	],
	weightlifting: ["olympic", "barbell", "clean", "jerk", "snatch", "technique"],
	technique: ["olympic", "powerlifting", "barbell", "form"],
	bodybuilding: ["hypertrophy", "muscle", "physique", "transformation"],
	hypertrophy: ["bodybuilding", "muscle", "physique", "transformation"],
	wellness: [
		"lifestyle",
		"nutrition",
		"longevity",
		"sustainable",
		"health",
		"transformation",
	],
	female: ["women", "woman", "female", "lifestyle", "wellness", "nutrition"],
	woman: ["women", "female", "wellness", "lifestyle"],
	women: ["woman", "female", "wellness", "lifestyle"],
	nutrition: ["wellness", "lifestyle", "sustainable", "health"],
	lifestyle: ["wellness", "nutrition", "longevity", "transformation"],
	athlete: ["athleticism", "conditioning", "strength", "performance"],
	athletic: ["athleticism", "conditioning", "strength", "performance"],
	conditioning: ["athleticism", "strength", "performance", "resilience"],
	performance: ["strength", "conditioning", "athleticism", "resilience"],
};

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"in",
	"into",
	"is",
	"it",
	"of",
	"on",
	"or",
	"that",
	"the",
	"this",
	"to",
	"with",
	"who",
	"looking",
	"look",
	"find",
	"coach",
	"coaches",
	"trainer",
	"training",
]);

// --- Clustering ---
// Grid-based clustering: at each zoom level, snap coach coords to a grid cell
// and merge coaches that land in the same cell.
const CLUSTER_GRID_SIZE_DEG = {
	3: 8,
	4: 5,
	5: 2.5,
	6: 1.2,
	7: 0.6,
	8: 0.3,
};

function clusterCoaches(coaches, zoom) {
	const gridSize = CLUSTER_GRID_SIZE_DEG[Math.min(zoom, 8)] ?? 0;
	if (!gridSize) {
		// At high zoom, each coach is its own cluster
		return coaches.map((coach) => ({
			id: `single-${coach.id}`,
			coaches: [coach],
			lat: coach.coords[0],
			lng: coach.coords[1],
			count: 1,
		}));
	}

	const cells = new Map();
	coaches.forEach((coach) => {
		const cellLat =
			Math.floor(coach.coords[0] / gridSize) * gridSize + gridSize / 2;
		const cellLng =
			Math.floor(coach.coords[1] / gridSize) * gridSize + gridSize / 2;
		const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
		if (!cells.has(key)) {
			cells.set(key, { coaches: [], lat: cellLat, lng: cellLng });
		}
		cells.get(key).coaches.push(coach);
	});

	return Array.from(cells.entries()).map(([key, cell]) => ({
		id: `cluster-${key}`,
		coaches: cell.coaches,
		lat: cell.lat,
		lng: cell.lng,
		count: cell.coaches.length,
	}));
}

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState(
		typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
	);
	useEffect(() => {
		const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
		handleResize();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	return isDesktop;
}

function normalizeToken(token) {
	return token
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.replace(/ies$/, "y")
		.replace(/ing$/, "")
		.replace(/ers$/, "er")
		.replace(/s$/, "");
}

function tokenizeText(text) {
	return String(text || "")
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.map(normalizeToken)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function expandTokens(tokens) {
	const expanded = [];
	tokens.forEach((token) => {
		expanded.push({ token, weight: 1 });
		(SEMANTIC_SYNONYMS[token] || []).forEach((synonym) => {
			expanded.push({ token: normalizeToken(synonym), weight: 0.72 });
		});
	});
	return expanded.filter(
		({ token }) => token.length > 1 && !STOP_WORDS.has(token),
	);
}

function getCoachSearchText(coach) {
	return [
		coach.name,
		coach.title,
		coach.city,
		coach.bio,
		coach.state,
		coach.stateAbbr,
		coach.specialties?.join(" "),
		coach.onlineTraining ? "online training" : "",
	].join(" ");
}

function buildWeightedVector(weightedTokens, idfMap = {}) {
	return weightedTokens.reduce((vector, { token, weight }) => {
		const idf = idfMap[token] || 1;
		vector[token] = (vector[token] || 0) + weight * idf;
		return vector;
	}, {});
}

function cosineSimilarity(vectorA, vectorB) {
	let dot = 0,
		magA = 0,
		magB = 0;
	Object.entries(vectorA).forEach(([token, value]) => {
		dot += value * (vectorB[token] || 0);
		magA += value * value;
	});
	Object.values(vectorB).forEach((value) => {
		magB += value * value;
	});
	if (!magA || !magB) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function rankCoachesBySemanticSearch(coaches, query) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) return coaches;

	const documents = coaches.map((coach, index) => {
		const baseTokens = tokenizeText(getCoachSearchText(coach));
		const expandedTokens = expandTokens(baseTokens);
		return {
			coach,
			index,
			tokens: expandedTokens,
			uniqueTokens: new Set(expandedTokens.map(({ token }) => token)),
		};
	});

	const documentFrequency = {};
	documents.forEach((doc) => {
		doc.uniqueTokens.forEach((token) => {
			documentFrequency[token] = (documentFrequency[token] || 0) + 1;
		});
	});

	const idfMap = Object.fromEntries(
		Object.entries(documentFrequency).map(([token, count]) => [
			token,
			Math.log((documents.length + 1) / (count + 1)) + 1,
		]),
	);

	const queryTokens = expandTokens(tokenizeText(trimmedQuery));
	const queryVector = buildWeightedVector(queryTokens, idfMap);

	return documents
		.map((doc) => {
			const coachVector = buildWeightedVector(doc.tokens, idfMap);
			return {
				coach: doc.coach,
				index: doc.index,
				score: cosineSimilarity(queryVector, coachVector),
			};
		})
		.filter(({ score }) => score > 0.01)
		.sort((a, b) =>
			b.score !== a.score ? b.score - a.score : a.index - b.index,
		)
		.map(({ coach }) => coach);
}

function getOuterRingsFromGeometry(geometry) {
	if (!geometry) return [];
	if (geometry.type === "Polygon")
		return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates
			.map((p) => p?.[0])
			.filter((r) => Array.isArray(r) && r.length > 2);
	}
	return [];
}

function getRingAreaAndCentroid(ring) {
	let doubledArea = 0,
		centroidLng = 0,
		centroidLat = 0;
	for (let i = 0; i < ring.length - 1; i++) {
		const [lng1, lat1] = ring[i],
			[lng2, lat2] = ring[i + 1];
		const cross = lng1 * lat2 - lng2 * lat1;
		doubledArea += cross;
		centroidLng += (lng1 + lng2) * cross;
		centroidLat += (lat1 + lat2) * cross;
	}
	if (Math.abs(doubledArea) < 0.000001) {
		const total = ring.reduce(
			(acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
			{ lng: 0, lat: 0 },
		);
		return {
			area: 0,
			center: [total.lat / ring.length, total.lng / ring.length],
		};
	}
	return {
		area: Math.abs(doubledArea / 2),
		center: [centroidLat / (3 * doubledArea), centroidLng / (3 * doubledArea)],
	};
}

function getBestStateLabelLatLng(feature, fallbackCenter) {
	const stateName = feature.properties.name;
	if (STATE_LABEL_COORD_OVERRIDES[stateName])
		return L.latLng(STATE_LABEL_COORD_OVERRIDES[stateName]);
	const rings = getOuterRingsFromGeometry(feature.geometry);
	if (!rings.length) return fallbackCenter;
	const largestRing = rings
		.map((ring) => ({ ring, ...getRingAreaAndCentroid(ring) }))
		.sort((a, b) => b.area - a.area)[0];
	if (!largestRing?.center) return fallbackCenter;
	return L.latLng(largestRing.center[0], largestRing.center[1]);
}

function runSelfTests() {
	const coaches = getAllCoaches();
	console.assert(
		getStateByAbbr("CA")?.name === "California",
		"CA state lookup should return California",
	);
	console.assert(
		coaches.every((c) => c.state && c.abbr),
		"Every coach should include state metadata",
	);
	console.assert(
		STATE_ABBR_BY_NAME["New York"] === "NY",
		"State abbreviation lookup should include New York",
	);
}
if (typeof window !== "undefined") runSelfTests();

const styles = {
	shell: {
		minHeight: "100vh",
		background:
			"radial-gradient(circle at top left, rgba(198,197,195,0.08), transparent 34%), linear-gradient(135deg, #1E1C1E, #373537)",
		color: palette.text,
		fontFamily:
			"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
		position: "relative",
		overflow: "hidden",
	},
	map: {
		width: "100%",
		height: "100dvh",
		filter: "grayscale(1) contrast(1.05) brightness(0.82)",
	},
	introOverlay: {
		position: "fixed",
		inset: 0,
		zIndex: 1200,
		display: "grid",
		placeItems: "center",
		padding: 22,
		background: "rgba(0,0,0,0.48)",
		backdropFilter: "blur(7px)",
		WebkitBackdropFilter: "blur(7px)",
	},
	introModal: {
		position: "relative",
		width: "min(560px, calc(100vw - 44px))",
		padding: "28px 28px 26px",
		background:
			"linear-gradient(145deg, rgba(30,28,30,0.96), rgba(55,53,55,0.9))",
		border: `1px solid ${palette.border}`,
		borderRadius: 24,
		boxShadow: "0 34px 90px rgba(0,0,0,0.52)",
		color: palette.text,
	},
	introCloseButton: {
		position: "absolute",
		top: 16,
		right: 16,
		width: 40,
		height: 40,
		borderRadius: 999,
		border: `1px solid ${palette.border}`,
		background: "rgba(198,197,195,0.07)",
		color: palette.graphite100,
		cursor: "pointer",
		fontSize: 22,
		lineHeight: 1,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
	},
	eyebrow: {
		margin: "0 0 8px",
		fontSize: 11,
		letterSpacing: "0.18em",
		textTransform: "uppercase",
		color: palette.muted,
	},
	title: {
		margin: 0,
		fontSize: 24,
		lineHeight: 1.12,
		fontWeight: 650,
		letterSpacing: "-0.04em",
		color: palette.muted,
	},
	description: {
		margin: "10px 0 0",
		color: palette.muted,
		fontSize: 14,
		lineHeight: 1.5,
	},
	stats: {
		display: "grid",
		gridTemplateColumns: "repeat(3, 1fr)",
		gap: 10,
		marginTop: 16,
	},
	stat: {
		padding: "11px 10px",
		border: `1px solid ${palette.border}`,
		borderRadius: 12,
		background: "rgba(198,197,195,0.045)",
	},
	statStrong: {
		display: "block",
		fontSize: 17,
		lineHeight: 1,
		color: palette.text,
	},
	statLabel: {
		display: "block",
		marginTop: 5,
		fontSize: 11,
		color: palette.muted,
	},
	semanticSearchButton: {
		position: "absolute",
		zIndex: 902,
		left: 24,
		bottom: 158,
		display: "inline-flex",
		alignItems: "center",
		gap: 9,
		padding: "13px 17px",
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		color: palette.text,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
		cursor: "pointer",
		fontWeight: 700,
		fontSize: 14,
		lineHeight: 1,
	},
	semanticSearchButtonActive: {
		background: palette.graphite100,
		color: palette.graphite900,
		border: "1px solid rgba(198,197,195,0.46)",
	},
	semanticSearchIcon: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		color: "currentColor",
		fontSize: 15,
		lineHeight: 1,
		fontWeight: 400,
		transform: "translateY(-0.5px)",
	},
	controls: {
		position: "absolute",
		zIndex: 900,
		left: 24,
		bottom: 86,
		display: "flex",
		gap: 10,
		padding: 8,
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
	},
	favoritesBar: {
		position: "absolute",
		zIndex: 901,
		left: 24,
		bottom: 24,
		display: "inline-flex",
		alignItems: "center",
		gap: 10,
		padding: "13px 17px",
		background: palette.panel,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		color: palette.text,
		backdropFilter: "blur(18px)",
		boxShadow: "0 20px 60px rgba(0,0,0,0.36)",
		cursor: "pointer",
		fontWeight: 700,
		fontSize: 14,
		lineHeight: 1,
	},
	favoritesCount: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		minWidth: 24,
		height: 24,
		padding: "0 7px",
		borderRadius: 999,
		background: palette.graphite100,
		color: palette.graphite900,
		fontSize: 12,
		fontWeight: 850,
	},
	controlButton: {
		border: 0,
		borderRadius: 999,
		padding: "11px 14px",
		cursor: "pointer",
		color: palette.text,
		background: "transparent",
		font: "inherit",
		fontSize: 13,
		transition: "background 160ms ease, color 160ms ease, transform 160ms ease",
	},
	activeControl: {
		background: palette.graphite100,
		color: palette.graphite900,
	},
	glassPanel: {
		position: "fixed",
		top: 0,
		right: 0,
		height: "100vh",
		width: 430,
		background:
			"linear-gradient(145deg, rgba(30,28,30,0.96) 0%, rgba(55,53,55,0.94) 100%)",
		boxShadow: "-2px 0 56px rgba(0,0,0,0.46)",
		borderLeft: `1px solid ${palette.border}`,
		zIndex: 1000,
		padding: "34px 34px 22px",
		display: "flex",
		flexDirection: "column",
		gap: 22,
		transition: "all 0.42s cubic-bezier(.66,.09,.28,1)",
		backdropFilter: "blur(18px) saturate(130%)",
		overflowY: "hidden",
		overscrollBehavior: "contain",
	},
	glassPanelHidden: {
		transform: "translateX(104%)",
		pointerEvents: "none",
		opacity: 0,
	},
	glassPanelShown: { transform: "none", pointerEvents: "all", opacity: 1 },
	backArrow: {
		cursor: "pointer",
		width: 38,
		height: 38,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		opacity: 0.92,
		fontSize: 22,
		fontWeight: "bold",
		color: palette.graphite100,
		background: "rgba(198,197,195,0.06)",
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		outline: "none",
		transition: "background 160ms ease, transform 160ms ease",
	},
	heartButton: {
		cursor: "pointer",
		width: 42,
		height: 42,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: 21,
		color: palette.graphite100,
		background: "rgba(198,197,195,0.06)",
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		outline: "none",
		transition: "background 160ms ease, transform 160ms ease, color 160ms ease",
	},
	heartButtonActive: {
		background: "rgba(217,189,125,0.16)",
		border: "1px solid rgba(217,189,125,0.46)",
		color: "#F2D88B",
	},
	profileTopRow: {
		width: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 2,
	},
	coachListHeader: {
		display: "flex",
		alignItems: "center",
		gap: 13,
		marginBottom: 14,
	},
	searchInput: {
		width: "100%",
		padding: "12px 16px",
		borderRadius: 13,
		fontSize: 15,
		margin: "0 0 22px 0",
		outline: "none",
		background: "rgba(30,28,30,0.72)",
		border: `1px solid ${palette.border}`,
		color: palette.text,
		boxShadow: "0 1.5px 8px rgba(0,0,0,0.22) inset",
	},
	coachCard: {
		background:
			"linear-gradient(90deg, rgba(55,53,55,0.72), rgba(78,76,78,0.42))",
		borderRadius: 18,
		padding: "18px 20px",
		marginBottom: 18,
		boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
		display: "flex",
		alignItems: "center",
		gap: 16,
		cursor: "pointer",
		border: `1px solid ${palette.border}`,
		transition:
			"border-color 0.18s ease, box-shadow 0.26s ease, transform 0.18s ease",
		position: "relative",
	},
	coachCardHovered: {
		border: "1px solid rgba(198,197,195,0.34)",
		boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
		transform: "translateY(-2px)",
		zIndex: 3,
	},
	headshot: {
		width: 68,
		height: 68,
		borderRadius: "50%",
		objectFit: "cover",
		border: "3px solid rgba(198,197,195,0.20)",
		background: palette.graphite800,
		margin: 0,
		filter: "grayscale(0.15)",
	},
	coachInfo: { flex: 1, minWidth: 0 },
	coachName: {
		fontWeight: 650,
		fontSize: 17,
		marginBottom: 2,
		color: palette.text,
	},
	coachTitle: { fontSize: 14, color: palette.graphite100, marginBottom: 3 },
	coachLocation: { fontSize: 13, color: palette.muted, marginBottom: 4 },
	coachRating: {
		fontSize: 13.5,
		color: palette.graphite100,
		fontWeight: 650,
		marginBottom: 2,
		marginLeft: 1,
	},
	tagList: { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 7 },
	tag: {
		display: "inline-block",
		fontSize: 12.4,
		fontWeight: 550,
		padding: "4px 10px",
		background: "rgba(198,197,195,0.08)",
		color: palette.graphite100,
		border: `1px solid ${palette.border}`,
		borderRadius: 999,
		marginTop: 2,
		letterSpacing: 0.1,
	},
	profilePanel: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: 15,
		marginTop: 2,
	},
	profileHeadshot: {
		width: 118,
		height: 118,
		borderRadius: "50%",
		objectFit: "cover",
		border: "4px solid rgba(198,197,195,0.24)",
		boxShadow: "0 18px 56px rgba(0,0,0,0.42)",
		marginBottom: 4,
		marginTop: 6,
		background: palette.graphite800,
		filter: "grayscale(0.1)",
	},
	profileName: {
		fontWeight: 720,
		fontSize: 25,
		color: palette.text,
		lineHeight: 1.08,
		marginBottom: 2,
		textAlign: "center",
	},
	profileTitle: {
		color: palette.graphite100,
		fontSize: 16,
		fontWeight: 550,
		marginBottom: 4,
		textAlign: "center",
	},
	profileLocation: {
		color: palette.muted,
		fontSize: 14,
		marginBottom: 3,
		textAlign: "center",
	},
	profileBio: {
		color: "rgba(242,241,239,0.78)",
		fontSize: 14.8,
		lineHeight: 1.55,
		marginBottom: 8,
		textAlign: "center",
		maxWidth: 320,
	},
	profileStats: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginBottom: 10,
		flexWrap: "wrap",
	},
	profileStat: {
		color: palette.graphite100,
		fontSize: 13.8,
		fontWeight: 550,
		background: "rgba(198,197,195,0.07)",
		border: `1px solid ${palette.border}`,
		padding: "7px 12px",
		borderRadius: 999,
		margin: 0,
	},
	primaryButton: {
		display: "block",
		width: "100%",
		background: palette.graphite100,
		color: palette.graphite900,
		fontWeight: 750,
		fontSize: 16.5,
		border: "none",
		borderRadius: 999,
		padding: "15px 0",
		marginTop: 10,
		marginBottom: 20,
		cursor: "pointer",
		boxShadow: "0 18px 42px rgba(0,0,0,0.30)",
		letterSpacing: 0.1,
		transition: "filter 160ms ease, transform 160ms ease",
	},
	contactPanel: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		minHeight: 0,
		gap: 0,
	},
	contactTopRow: {
		width: "100%",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 22,
	},
	contactHeader: {
		display: "flex",
		alignItems: "center",
		gap: 14,
		paddingBottom: 18,
		borderBottom: "1px solid rgba(198,197,195,0.12)",
	},
	contactAvatar: {
		width: 58,
		height: 58,
		borderRadius: "50%",
		objectFit: "cover",
		border: "2px solid rgba(198,197,195,0.22)",
		background: palette.graphite800,
		filter: "grayscale(0.08)",
		flexShrink: 0,
	},
	contactName: {
		fontSize: 18,
		fontWeight: 760,
		color: palette.text,
		lineHeight: 1.15,
		marginBottom: 5,
	},
	contactSpecialty: {
		fontSize: 13,
		color: palette.muted,
		lineHeight: 1.35,
	},
	messageArea: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		justifyContent: "flex-end",
		padding: "22px 0 0",
		minHeight: 0,
	},
	messageHint: {
		alignSelf: "center",
		maxWidth: 300,
		margin: "28px 0 auto",
		padding: "14px 16px",
		borderRadius: 18,
		background: "rgba(198,197,195,0.055)",
		border: `1px solid ${palette.border}`,
		color: "rgba(242,241,239,0.72)",
		fontSize: 13.5,
		lineHeight: 1.45,
		textAlign: "center",
	},
	messageSentBubble: {
		alignSelf: "flex-end",
		maxWidth: "86%",
		padding: "12px 14px",
		borderRadius: "18px 18px 6px 18px",
		background: palette.graphite100,
		color: palette.graphite900,
		fontSize: 14,
		lineHeight: 1.45,
		fontWeight: 560,
		boxShadow: "0 14px 32px rgba(0,0,0,0.26)",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	},
	messageInputWrap: {
		display: "flex",
		alignItems: "flex-end",
		gap: 10,
		paddingTop: 16,
		borderTop: "1px solid rgba(198,197,195,0.10)",
	},
	messageInput: {
		flex: 1,
		minHeight: 52,
		maxHeight: 112,
		resize: "none",
		overflowY: "hidden",
		borderRadius: 18,
		padding: "14px 15px",
		outline: "none",
		background: "rgba(30,28,30,0.76)",
		border: `1px solid ${palette.border}`,
		color: palette.text,
		fontFamily: "inherit",
		fontSize: 14.5,
		lineHeight: 1.4,
		boxShadow: "0 1.5px 8px rgba(0,0,0,0.22) inset",
	},
	sendButton: {
		width: 54,
		height: 54,
		borderRadius: 999,
		border: "none",
		background: palette.graphite100,
		color: palette.graphite900,
		cursor: "pointer",
		fontSize: 20,
		fontWeight: 850,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		boxShadow: "0 16px 34px rgba(0,0,0,0.32)",
		flexShrink: 0,
	},
	sendButtonDisabled: {
		opacity: 0.45,
		cursor: "not-allowed",
		boxShadow: "none",
	},
	emptyState: {
		color: "rgba(198,197,195,0.72)",
		marginTop: 50,
		fontSize: 15,
		textAlign: "center",
		lineHeight: 1.55,
	},
	coachListPanelInner: {
		overflowY: "auto",
		height: "100%",
		maxHeight: "100%",
		overscrollBehaviorY: "contain",
		paddingBottom: 6,
	},
	mobileSheetHandle: {
		display: "block",
		width: 42,
		height: 4,
		borderRadius: 999,
		background: "rgba(198,197,195,0.22)",
		margin: "0 auto 14px",
		flexShrink: 0,
	},
};

function CoachTag({ children }) {
	return <span style={styles.tag}>{children}</span>;
}
function StarRating({ value }) {
	return <span style={styles.coachRating}>★ {value}</span>;
}

function CoachCard({ coach, onClick, hovered, onMouseEnter, onMouseLeave }) {
	return (
		<div
			style={{
				...styles.coachCard,
				...(hovered ? styles.coachCardHovered : {}),
			}}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<img
				src={coach.headshot}
				alt={coach.name}
				style={styles.headshot}
				loading="lazy"
			/>
			<div style={styles.coachInfo}>
				<div style={styles.coachName}>{coach.name}</div>
				<div style={styles.coachTitle}>{coach.title}</div>
				<div style={styles.coachLocation}>
					{coach.city}
					{coach.onlineTraining ? " • Online coaching" : ""}
				</div>
				<StarRating value={coach.rating} />
				<div style={styles.tagList}>
					{coach.specialties.map((tag) => (
						<CoachTag key={tag}>{tag}</CoachTag>
					))}
				</div>
			</div>
		</div>
	);
}

function CoachProfile({
	coach,
	onBack,
	isFavorite,
	onToggleFavorite,
	onContact,
}) {
	return (
		<div style={styles.profilePanel}>
			<div style={styles.profileTopRow}>
				<button
					style={styles.backArrow}
					aria-label="Back to list"
					onClick={onBack}
				>
					←
				</button>
				<button
					style={{
						...styles.heartButton,
						...(isFavorite ? styles.heartButtonActive : {}),
					}}
					aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
					onClick={() => onToggleFavorite(coach.id)}
				>
					{isFavorite ? "♥" : "♡"}
				</button>
			</div>
			<img
				src={coach.headshot}
				alt={coach.name}
				style={styles.profileHeadshot}
				loading="lazy"
			/>
			<div style={styles.profileName}>{coach.name}</div>
			<div style={styles.profileTitle}>{coach.title}</div>
			<div style={styles.profileLocation}>
				📍 {coach.city}
				{coach.onlineTraining ? " • Online coaching" : ""}
			</div>
			<div style={styles.profileBio}>{coach.bio}</div>
			<div style={{ ...styles.tagList, justifyContent: "center" }}>
				{coach.specialties.map((tag) => (
					<CoachTag key={tag}>{tag}</CoachTag>
				))}
			</div>
			<div style={styles.profileStats}>
				<span style={styles.profileStat}>
					{coach.experience
						? `🏋️ ${coach.experience}`
						: `🏋️ ${coach.roster} athletes`}
				</span>
				{coach.roster ? (
					<span style={styles.profileStat}>Roster: {coach.roster}</span>
				) : null}
				{coach.onlineTraining ? (
					<span style={styles.profileStat}>Online coaching</span>
				) : null}
			</div>
			<button
				type="button"
				style={styles.primaryButton}
				onClick={() => onContact(coach)}
			>
				Contact now
			</button>
		</div>
	);
}

function ContactPanel({ coach, onBack, isDesktop }) {
	const messageInputRef = useRef(null);
	const [message, setMessage] = useState(
		`Hi ${coach.name.split(" ")[0]}, I found your profile on Weightlisted and wanted to ask about coaching.`,
	);
	const [sentMessage, setSentMessage] = useState("");

	const primarySpecialty = coach.specialties?.[0] || coach.title || "Coach";
	const specialtyLabel = coach.specialties?.length
		? coach.specialties.slice(0, 2).join(" • ")
		: coach.title;

	function resizeMessageInput(textarea) {
		if (!textarea) return;
		const maxHeight = 112;
		textarea.style.height = "auto";
		const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY =
			textarea.scrollHeight > maxHeight ? "auto" : "hidden";
	}

	useEffect(() => {
		resizeMessageInput(messageInputRef.current);
	}, [message]);

	function handleSend() {
		const trimmed = message.trim();
		if (!trimmed) return;
		setSentMessage(trimmed);
		setMessage("");
	}

	function handleMessageChange(event) {
		setMessage(event.target.value);
		resizeMessageInput(event.target);
	}

	function handleMessageKeyDown(event) {
		if (event.key === "Enter" && event.ctrlKey) {
			event.preventDefault();
			handleSend();
		}
	}

	return (
		<div
			style={{
				...styles.contactPanel,
				...(isDesktop ? {} : { minHeight: 0 }),
			}}
		>
			<div style={styles.contactTopRow}>
				<button
					type="button"
					style={styles.backArrow}
					aria-label="Back to coach profile"
					onClick={onBack}
				>
					←
				</button>
				<span
					style={{
						fontSize: 12,
						color: palette.muted,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					Direct message
				</span>
			</div>

			<div style={styles.contactHeader}>
				<img
					src={coach.headshot}
					alt={coach.name}
					style={styles.contactAvatar}
					loading="lazy"
				/>
				<div style={{ minWidth: 0 }}>
					<div style={styles.contactName}>{coach.name}</div>
					<div style={styles.contactSpecialty}>
						{primarySpecialty}
						{specialtyLabel && specialtyLabel !== primarySpecialty
							? ` • ${specialtyLabel}`
							: ""}
					</div>
				</div>
			</div>

			<div
				style={{
					...styles.messageArea,
					...(isDesktop ? {} : { paddingTop: 14 }),
				}}
			>
				{sentMessage ? (
					<div style={styles.messageSentBubble}>{sentMessage}</div>
				) : (
					<div style={styles.messageHint}>
						Start with your goal, timeline, and whether you want in-person or
						online coaching.
					</div>
				)}

				<div style={styles.messageInputWrap}>
					<textarea
						ref={messageInputRef}
						style={styles.messageInput}
						placeholder="Type your message..."
						value={message}
						onChange={handleMessageChange}
						onKeyDown={handleMessageKeyDown}
						rows={1}
						autoFocus
					/>
					<button
						type="button"
						style={{
							...styles.sendButton,
							...(!message.trim() ? styles.sendButtonDisabled : {}),
						}}
						onClick={handleSend}
						disabled={!message.trim()}
						aria-label="Send message"
					>
						➤
					</button>
				</div>
			</div>
		</div>
	);
}

function CoachListPanel({
	title,
	eyebrow,
	coaches,
	onBack,
	search,
	setSearch,
	hoveredCoachId,
	setHoveredCoachId,
	profileCoach,
	setProfileCoach,
	favoriteCoachIds,
	onToggleFavorite,
	contactCoach,
	setContactCoach,
	isDesktop,
	emptyMessage,
}) {
	const filtered = rankCoachesBySemanticSearch(coaches, search);

	if (contactCoach) {
		return (
			<ContactPanel
				coach={contactCoach}
				onBack={() => setContactCoach(null)}
				isDesktop={isDesktop}
			/>
		);
	}

	if (profileCoach) {
		return (
			<CoachProfile
				coach={profileCoach}
				onBack={() => setProfileCoach(null)}
				isFavorite={favoriteCoachIds.includes(profileCoach.id)}
				onToggleFavorite={onToggleFavorite}
				onContact={setContactCoach}
			/>
		);
	}

	return (
		<div style={styles.coachListPanelInner}>
			<div style={styles.coachListHeader}>
				<button
					style={styles.backArrow}
					aria-label="Back to map"
					onClick={onBack}
				>
					←
				</button>
				<div>
					<div
						style={{
							fontSize: 12,
							color: palette.muted,
							textTransform: "uppercase",
							letterSpacing: "0.18em",
						}}
					>
						{eyebrow}
					</div>
					<div
						style={{
							fontWeight: 720,
							fontSize: 21,
							color: palette.text,
							letterSpacing: -0.3,
						}}
					>
						{title}
					</div>
				</div>
			</div>
			<input
				style={styles.searchInput}
				placeholder="Describe what you want, like heavy lifting or female wellness..."
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				autoFocus
			/>
			<div>
				{filtered.length === 0 ? (
					<div style={styles.emptyState}>{emptyMessage}</div>
				) : null}
				{filtered.map((coach) => (
					<CoachCard
						key={coach.id}
						coach={coach}
						onClick={() => {
							setContactCoach(null);
							setProfileCoach(coach);
						}}
						hovered={hoveredCoachId === coach.id}
						onMouseEnter={() => setHoveredCoachId(coach.id)}
						onMouseLeave={() => setHoveredCoachId(null)}
					/>
				))}
			</div>
		</div>
	);
}

function createClusterIcon(count, active = false) {
	const isCluster = count > 1;
	// Scale size slightly with count, capped
	const size = active
		? 38
		: isCluster
			? Math.min(28 + (count - 1) * 3, 46)
			: 28;
	const fontSize = isCluster ? Math.max(10, Math.min(14, size * 0.35)) : 11;
	return L.divIcon({
		className: "",
		html: `<div class="coach-map-marker${active ? " active" : ""}${isCluster ? " cluster" : ""}" style="width:${size}px;height:${size}px;font-size:${fontSize}px;"><span>${count}</span></div>`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

function getResponsiveStateLabelSize(map, bounds) {
	const nw = map.latLngToLayerPoint(bounds.getNorthWest());
	const se = map.latLngToLayerPoint(bounds.getSouthEast());
	const pixelWidth = Math.abs(se.x - nw.x);
	const pixelHeight = Math.abs(se.y - nw.y);
	const smallestSide = Math.min(pixelWidth, pixelHeight);
	return {
		fontSize: Math.max(5, Math.min(12, smallestSide * 0.18)),
		labelWidth: Math.max(12, Math.min(34, pixelWidth * 0.46)),
		opacity: smallestSide < 14 ? 0.08 : smallestSide < 24 ? 0.14 : 0.22,
	};
}

function createStateLabelIcon({
	abbr,
	hasCoaches,
	fontSize,
	labelWidth,
	opacity,
}) {
	return L.divIcon({
		className: "",
		html: `<div class="state-block-label ${hasCoaches ? "has-coaches" : ""}" style="font-size:${fontSize}px;width:${labelWidth}px;opacity:${opacity};">${abbr}</div>`,
		iconSize: [0, 0],
		iconAnchor: [0, 0],
	});
}

function addGlobalMapStyles() {
	const style = document.createElement("style");
	style.innerHTML = `
    .leaflet-container { background: ${palette.graphite900}; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .leaflet-control-zoom { border: 1px solid ${palette.border} !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,0.28) !important; }
    .leaflet-control-zoom a { background: rgba(30,28,30,0.88) !important; color: ${palette.graphite100} !important; border-bottom: 1px solid ${palette.border} !important; }
    .leaflet-control-zoom a:hover { background: ${palette.graphite700} !important; color: white !important; }
    .leaflet-popup-content-wrapper { background: ${palette.graphite900}; color: ${palette.text}; border: 1px solid ${palette.border}; border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,0.45); }
    .leaflet-popup-tip { background: ${palette.graphite900}; }

    .coach-map-marker {
      border-radius: 999px;
      background: ${palette.graphite100};
      border: 5px solid ${palette.graphite800};
      box-shadow: 0 0 0 1px rgba(198,197,195,0.42), 0 12px 26px rgba(0,0,0,0.46);
      display: flex; align-items: center; justify-content: center;
      color: ${palette.graphite900};
      font-weight: 800;
      transition: width 220ms ease, height 220ms ease, font-size 220ms ease;
    }
    .coach-map-marker.active {
      background: #F2F1EF;
      box-shadow: 0 0 0 1px rgba(198,197,195,0.66), 0 18px 40px rgba(0,0,0,0.56);
    }
    .coach-map-marker.cluster {
      background: ${palette.graphite800};
      border-color: ${palette.graphite700};
      color: ${palette.text};
      box-shadow: 0 0 0 2px rgba(198,197,195,0.28), 0 14px 32px rgba(0,0,0,0.52);
    }

    .state-block-label { color: rgba(242,241,239,0.32); font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; text-align: center; text-shadow: 0 2px 6px rgba(0,0,0,0.62); pointer-events: none; user-select: none; white-space: nowrap; line-height: 1; transform: translate(-50%, -50%); transition: opacity 160ms ease, font-size 160ms ease; }
    .state-block-label.has-coaches { color: rgba(242,241,239,0.42); }
    .graphite-popup-title { margin: 0 0 5px; font-size: 15px; font-weight: 700; color: ${palette.text}; }
    .graphite-popup-meta { margin: 0; color: ${palette.muted}; font-size: 13px; line-height: 1.4; }

    .coach-tooltip-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
    .coach-tooltip-wrapper::before { display: none !important; }

    .coach-hover-tooltip {
      pointer-events: none;
      background: linear-gradient(145deg, rgba(22,20,22,0.98), rgba(50,48,50,0.96));
      border: 1px solid rgba(198,197,195,0.16); border-radius: 18px; padding: 14px 16px;
      min-width: 220px; max-width: 260px;
      box-shadow: 0 28px 64px rgba(0,0,0,0.58), 0 0 0 0.5px rgba(198,197,195,0.08);
      backdrop-filter: blur(20px);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      animation: tooltipFadeIn 140ms ease;
    }
    @keyframes tooltipFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .cht-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .cht-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(198,197,195,0.22); flex-shrink: 0; }
    .cht-name { font-size: 14px; font-weight: 700; color: #F2F1EF; margin: 0 0 1px; line-height: 1.2; }
    .cht-title { font-size: 12px; color: #A8A6A2; margin: 0; line-height: 1.3; }
    .cht-divider { height: 1px; background: rgba(198,197,195,0.10); margin: 9px 0; }
    .cht-location { font-size: 12px; color: #A8A6A2; margin: 0 0 5px; }
    .cht-rating { font-size: 12px; font-weight: 650; color: #C6C5C3; margin: 0 0 9px; }
    .cht-tags { display: flex; gap: 5px; flex-wrap: wrap; }
    .cht-tag { font-size: 11px; font-weight: 600; padding: 3px 9px; background: rgba(198,197,195,0.07); color: #C6C5C3; border: 1px solid rgba(198,197,195,0.13); border-radius: 999px; }

    .cluster-tooltip {
      pointer-events: none;
      background: linear-gradient(145deg, rgba(22,20,22,0.98), rgba(50,48,50,0.96));
      border: 1px solid rgba(198,197,195,0.16); border-radius: 14px; padding: 10px 14px;
      min-width: 140px;
      box-shadow: 0 18px 44px rgba(0,0,0,0.52);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      animation: tooltipFadeIn 140ms ease;
    }
    .cluster-tooltip-title { font-size: 13px; font-weight: 700; color: #F2F1EF; margin: 0 0 4px; }
    .cluster-tooltip-sub { font-size: 11px; color: #A8A6A2; margin: 0; }
  `;
	document.head.appendChild(style);
	return style;
}

export default function App() {
	const MOCK_STATES = useMemo(() => getStatesWithCoaches(), []);
	const mapNodeRef = useRef(null);
	const mapRef = useRef(null);
	const stateLayerRef = useRef(null);
	const isDesktop = useIsDesktop();
	const layersRef = useRef({
		stateZones: [],
		stateLabels: [],
		clusterMarkers: [],
	});
	const selectedStateRef = useRef(null);
	const allCoachesRef = useRef([]);
	const showOnlineRef = useRef(false);
	const renderClustersRef = useRef(null);

	const [selectedState, setSelectedState] = useState(null);
	const [search, setSearch] = useState("");
	const [hoveredCoachId, setHoveredCoachId] = useState(null);
	const [profileCoach, setProfileCoach] = useState(null);
	const [filter, setFilter] = useState("all");
	const [favoritesOpen, setFavoritesOpen] = useState(false);
	const [semanticSearchOpen, setSemanticSearchOpen] = useState(false);
	const [favoriteCoachIds, setFavoriteCoachIds] = useState([]);
	const [showIntroModal, setShowIntroModal] = useState(true);
	const [showOnline, setShowOnline] = useState(false);
	const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
	const [clusterPanel, setClusterPanel] = useState(null);
	const [contactCoach, setContactCoach] = useState(null);

	const allCoaches = useMemo(() => getAllCoaches(), []);
	const favoriteCoaches = useMemo(
		() => allCoaches.filter((c) => favoriteCoachIds.includes(c.id)),
		[allCoaches, favoriteCoachIds],
	);

	const panelVisible =
		Boolean(selectedState) ||
		favoritesOpen ||
		semanticSearchOpen ||
		showOnline ||
		Boolean(clusterPanel) ||
		Boolean(contactCoach);
	const state = selectedState ? getStateByAbbr(selectedState) : null;

	useEffect(() => {
		selectedStateRef.current = selectedState;
	}, [selectedState]);
	useEffect(() => {
		allCoachesRef.current = allCoaches;
	}, [allCoaches]);
	useEffect(() => {
		showOnlineRef.current = showOnline;
		renderClustersRef.current?.();
	}, [showOnline]);

	useEffect(() => {
		if (!mapRef.current) return undefined;
		const timeout = window.setTimeout(() => {
			mapRef.current?.invalidateSize();
		}, 260);
		return () => window.clearTimeout(timeout);
	}, [isDesktop, panelVisible]);

	useEffect(() => {
		if (!mapNodeRef.current || mapRef.current) return undefined;

		const style = addGlobalMapStyles();
		const map = L.map(mapNodeRef.current, {
			zoomControl: true,
			attributionControl: false,
			scrollWheelZoom: true,
		}).setView([38.8, -96.5], window.innerWidth >= 1024 ? 4 : 3);

		L.tileLayer(
			"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
			{ maxZoom: 20 },
		).addTo(map);

		const coaches = getAllCoaches();

		// ---- Cluster rendering ----
		function renderClusters() {
			// Remove existing cluster markers
			layersRef.current.clusterMarkers.forEach(({ layer }) => {
				if (map.hasLayer(layer)) map.removeLayer(layer);
			});
			layersRef.current.clusterMarkers = [];

			const zoom = map.getZoom();
			const visibleCoaches = showOnlineRef.current
				? coaches.filter((coach) => coach.onlineTraining)
				: coaches;
			const clusters = clusterCoaches(visibleCoaches, zoom);

			clusters.forEach((cluster) => {
				const { lat, lng, count, coaches: clusterCoaches } = cluster;
				const isMulti = count > 1;

				// Build tooltip HTML
				let tooltipHtml;
				if (isMulti) {
					const stateLabel = clusterCoaches[0]?.state || "";
					const cities = [...new Set(clusterCoaches.map((c) => c.city))];
					const cityLabel =
						cities.length === 1 ? cities[0] : `${cities.length} cities`;
					tooltipHtml = `
						<div class="cluster-tooltip">
							<div class="cluster-tooltip-title">${count} coaches</div>
							<div class="cluster-tooltip-sub">📍 ${cityLabel}${stateLabel ? `, ${stateLabel}` : ""}</div>
						</div>`;
				} else {
					const coach = clusterCoaches[0];
					tooltipHtml = `
						<div class="coach-hover-tooltip">
							<div class="cht-header">
								<img class="cht-avatar" src="${coach.headshot}" alt="${coach.name}" />
								<div>
									<div class="cht-name">${coach.name}</div>
									<div class="cht-title">${coach.title}</div>
								</div>
							</div>
							<div class="cht-divider"></div>
							<div class="cht-location">📍 ${coach.city}${coach.onlineTraining ? " · Online" : ""}</div>
							<div class="cht-rating">★ ${coach.rating}${coach.experience ? " · " + coach.experience : ""}</div>
							<div class="cht-tags">${(coach.specialties || []).map((s) => `<span class="cht-tag">${s}</span>`).join("")}</div>
						</div>`;
				}

				const popupHtml = isMulti
					? `<p class="graphite-popup-title">${count} coaches nearby</p><p class="graphite-popup-meta">${[...new Set(clusterCoaches.map((c) => c.city))].join(", ")}</p>`
					: `<p class="graphite-popup-title">${clusterCoaches[0].name}</p><p class="graphite-popup-meta">${clusterCoaches[0].title}<br />${clusterCoaches[0].city}</p>`;

				const marker = L.marker([lat, lng], { icon: createClusterIcon(count) })
					.bindTooltip(tooltipHtml, {
						direction: "top",
						offset: [0, -Math.min(28 + (count - 1) * 3, 46) / 2 - 4],
						opacity: 1,
						className: "coach-tooltip-wrapper",
					})
					.bindPopup(popupHtml)
					.on("click", () => {
						if (isMulti) {
							const cities = [...new Set(clusterCoaches.map((c) => c.city))];
							const states = [...new Set(clusterCoaches.map((c) => c.state))];
							const cityLabel =
								cities.length === 1 ? cities[0] : `${cities.length} cities`;
							const stateLabel =
								states.length === 1 ? states[0] : `${states.length} states`;

							setClusterPanel({
								id: cluster.id,
								coaches: clusterCoaches,
								title: `${count} Coaches Nearby`,
								eyebrow: `${cityLabel} • ${stateLabel}`,
							});
							setSelectedState(null);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setShowOnline(false);
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							map.flyTo([lat, lng], Math.max(zoom, 6), { duration: 0.65 });
						} else {
							const coach = clusterCoaches[0];
							const stateAbbr = coach.abbr;
							setSelectedState(stateAbbr);
							setClusterPanel(null);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setShowOnline(false);
							setProfileCoach(coach);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							map.flyTo(coach.coords, 10, { duration: 0.85 });
						}
					})
					.addTo(map);

				layersRef.current.clusterMarkers.push({
					abbr: clusterCoaches[0]?.abbr,
					layer: marker,
					count,
				});
			});
		}

		// ---- State borders ----
		const statesGeoJsonUrl =
			"https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";

		const updateStateLabels = () => {
			layersRef.current.stateLabels.forEach(
				({ stateName, layer, bounds, hasCoaches }) => {
					const labelScale = STATE_LABEL_SIZE_OVERRIDES[stateName] || 1;
					const { fontSize, labelWidth, opacity } = getResponsiveStateLabelSize(
						map,
						bounds,
					);
					const abbr = STATE_ABBR_BY_NAME[stateName];
					layer.setIcon(
						createStateLabelIcon({
							abbr,
							hasCoaches,
							fontSize: fontSize * labelScale,
							labelWidth: labelWidth * labelScale,
							opacity,
						}),
					);
				},
			);
		};

		fetch(statesGeoJsonUrl)
			.then((r) => r.json())
			.then((geojson) => {
				stateLayerRef.current = L.geoJSON(geojson, {
					style: (feature) => {
						const stateName = feature.properties.name;
						const hasCoaches = coaches.some((c) => c.state === stateName);
						return {
							color: hasCoaches
								? "rgba(218,220,215,0.48)"
								: "rgba(218,220,215,0.24)",
							weight: hasCoaches ? 0.95 : 0.55,
							fillColor: hasCoaches
								? "rgba(244,242,238,0.065)"
								: "rgba(244,242,238,0.025)",
							fillOpacity: 1,
						};
					},
					onEachFeature: (feature, layer) => {
						const stateName = feature.properties.name;
						const stateCoaches = coaches.filter((c) => c.state === stateName);
						if (!stateCoaches.length) return;
						layer.on("click", () => {
							const abbr = stateCoaches[0].abbr;
							const stateItem = getStateByAbbr(abbr);
							setSelectedState(abbr);
							setClusterPanel(null);
							setFavoritesOpen(false);
							setSemanticSearchOpen(false);
							setProfileCoach(null);
							setContactCoach(null);
							setSearch("");
							setLocationDropdownOpen(false);
							if (stateItem) map.flyTo(stateItem.center, 6, { duration: 0.85 });
						});
						layer.on("mouseover", () =>
							layer.setStyle({
								color: "rgba(217,189,125,0.88)",
								fillColor: "rgba(217,189,125,0.12)",
								weight: 1.3,
							}),
						);
						layer.on("mouseout", () =>
							stateLayerRef.current?.resetStyle(layer),
						);
					},
				}).addTo(map);

				layersRef.current.stateZones = [
					{ abbr: "US_STATES", layer: stateLayerRef.current },
				];

				geojson.features.forEach((feature) => {
					const stateName = feature.properties.name;
					const abbr = STATE_ABBR_BY_NAME[stateName];
					if (!abbr) return;
					const hasCoaches = coaches.some((c) => c.state === stateName);
					const tempLayer = L.geoJSON(feature);
					const bounds = tempLayer.getBounds();
					const fallbackCenter = bounds.getCenter();
					const labelLatLng = getBestStateLabelLatLng(feature, fallbackCenter);
					const labelScale = STATE_LABEL_SIZE_OVERRIDES[stateName] || 1;
					const { fontSize, labelWidth, opacity } = getResponsiveStateLabelSize(
						map,
						bounds,
					);

					const labelMarker = L.marker(labelLatLng, {
						interactive: false,
						pane: "markerPane",
						icon: createStateLabelIcon({
							abbr,
							hasCoaches,
							fontSize: fontSize * labelScale,
							labelWidth: labelWidth * labelScale,
							opacity,
						}),
					}).addTo(map);

					layersRef.current.stateLabels.push({
						abbr,
						stateName,
						layer: labelMarker,
						bounds,
						center: labelLatLng,
						hasCoaches,
					});
				});

				map.on("zoomend", () => {
					updateStateLabels();
					renderClusters();
				});
				updateStateLabels();
				renderClusters();
			})
			.catch(() => {
				// State borders failed, still render clusters
				map.on("zoomend", renderClusters);
				renderClusters();
			});

		renderClustersRef.current = renderClusters;
		mapRef.current = map;

		return () => {
			map.off("zoomend");
			map.remove();
			mapRef.current = null;
			stateLayerRef.current = null;
			renderClustersRef.current = null;
			layersRef.current = {
				stateZones: [],
				stateLabels: [],
				clusterMarkers: [],
			};
			style.remove();
		};
	}, []);

	useEffect(() => {
		if (!mapRef.current) return;
		const shouldShowStates = filter === "all" || filter === "states";
		const shouldShowCoaches = filter === "all" || filter === "coaches";

		layersRef.current.stateZones.forEach(({ layer }) => {
			if (shouldShowStates && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowStates && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
		layersRef.current.stateLabels.forEach(({ layer }) => {
			if (shouldShowStates && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowStates && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
		layersRef.current.clusterMarkers.forEach(({ layer }) => {
			if (shouldShowCoaches && !mapRef.current.hasLayer(layer))
				layer.addTo(mapRef.current);
			if (!shouldShowCoaches && mapRef.current.hasLayer(layer))
				mapRef.current.removeLayer(layer);
		});
	}, [filter]);

	function toggleFavoriteCoach(coachId) {
		setFavoriteCoachIds((current) =>
			current.includes(coachId)
				? current.filter((id) => id !== coachId)
				: [...current, coachId],
		);
	}

	function resetToMap() {
		setSelectedState(null);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setShowOnline(false);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo([38.8, -96.5], 4, { duration: 0.8 });
	}

	function selectState(abbr) {
		const stateItem = getStateByAbbr(abbr);
		if (!stateItem) return;
		setSelectedState(abbr);
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo(stateItem.center, 6, { duration: 0.85 });
	}

	function clearLocation() {
		setSelectedState(null);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		if (mapRef.current)
			mapRef.current.flyTo([38.8, -96.5], 4, { duration: 0.8 });
	}

	function openFavoritesPanel() {
		setSelectedState(null);
		setFavoritesOpen(true);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setShowOnline(false);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
	}

	function openSemanticSearchPanel() {
		setSelectedState(null);
		setFavoritesOpen(false);
		setSemanticSearchOpen(true);
		setProfileCoach(null);
		setContactCoach(null);
		setShowOnline(false);
		setClusterPanel(null);
		setLocationDropdownOpen(false);
	}

	function openOnlinePanel() {
		setFavoritesOpen(false);
		setSemanticSearchOpen(false);
		setProfileCoach(null);
		setContactCoach(null);
		setSearch("");
		setClusterPanel(null);
		setLocationDropdownOpen(false);
		setShowOnline((current) => !current);
		setFilter((current) => (current === "states" ? "all" : current));
	}

	const locationScopedCoaches = selectedState
		? state?.coaches || []
		: allCoaches;
	const locationAndOnlineCoaches = showOnline
		? locationScopedCoaches.filter((c) => c.onlineTraining)
		: locationScopedCoaches;
	const activePanelCoaches = clusterPanel
		? clusterPanel.coaches
		: semanticSearchOpen
			? allCoaches
			: favoritesOpen
				? favoriteCoaches
				: selectedState || showOnline
					? locationAndOnlineCoaches
					: [];
	const activePanelTitle = clusterPanel
		? clusterPanel.title
		: semanticSearchOpen
			? "Coach Search"
			: favoritesOpen
				? "Favorites"
				: selectedState && showOnline
					? `${state?.name} Online Training`
					: selectedState
						? state?.name || ""
						: showOnline
							? "Online Training"
							: "";
	const activePanelEyebrow = clusterPanel
		? clusterPanel.eyebrow
		: semanticSearchOpen
			? "Semantic matches"
			: favoritesOpen
				? "Saved coaches"
				: selectedState && showOnline
					? "Location + remote coaches"
					: selectedState
						? "Selected location"
						: showOnline
							? "Remote coaches"
							: "Selected filters";
	const activePanelEmptyMessage = clusterPanel
		? "No coaches found in this cluster."
		: semanticSearchOpen
			? "No matching coaches found. Try a broader phrase like strength, wellness, barbell, or performance."
			: favoritesOpen
				? "No favorites yet. Open a coach profile and tap the heart to save them here."
				: selectedState && showOnline
					? "No online training coaches found in this location."
					: showOnline
						? "No online training coaches found."
						: "No matching coaches found.";

	const isMobile = !isDesktop;
	const mobilePanelHeight = contactCoach ? "82dvh" : "76dvh";
	const mobileActionBottom = panelVisible
		? `calc(${mobilePanelHeight} + 14px + env(safe-area-inset-bottom))`
		: "calc(18px + env(safe-area-inset-bottom))";

	return (
		<main style={styles.shell}>
			{showIntroModal ? (
				<div
					style={styles.introOverlay}
					role="dialog"
					aria-modal="true"
					aria-labelledby="coach-map-intro-title"
				>
					<section style={styles.introModal}>
						<button
							type="button"
							style={styles.introCloseButton}
							onClick={() => setShowIntroModal(false)}
							aria-label="Close intro popup"
						>
							×
						</button>
						<p style={styles.eyebrow}>Graphite Mix</p>
						<h1
							id="coach-map-intro-title"
							style={{
								...styles.title,
								fontSize: 32,
								color: palette.graphite100,
								paddingRight: 44,
							}}
						>
							Strength Coach Discovery
						</h1>
						<p style={{ ...styles.description, fontSize: 16, maxWidth: 460 }}>
							A minimal graphite map for finding powerlifting, strength,
							bodybuilding, and lifestyle coaches by location.
						</p>
						<div style={styles.stats}>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>{MOCK_STATES.length}</strong>
								<span style={styles.statLabel}>States</span>
							</div>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>{allCoaches.length}</strong>
								<span style={styles.statLabel}>Coaches</span>
							</div>
							<div style={styles.stat}>
								<strong style={styles.statStrong}>4.8</strong>
								<span style={styles.statLabel}>Avg rating</span>
							</div>
						</div>
					</section>
				</div>
			) : null}

			<div
				ref={mapNodeRef}
				style={{
					...styles.map,
					height: isMobile ? "100dvh" : styles.map.height,
				}}
			/>

			<button
				type="button"
				style={{
					...styles.semanticSearchButton,
					...(isMobile
						? {
								left: 14,
								right: "auto",
								bottom: mobileActionBottom,
								width: "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
					...(semanticSearchOpen ? styles.semanticSearchButtonActive : {}),
				}}
				onClick={openSemanticSearchPanel}
				aria-label="Open semantic coach search"
			>
				<span style={styles.semanticSearchIcon}>⌕</span>
				<span>Search coaches</span>
			</button>

			<nav
				style={{
					...styles.controls,
					...(isMobile
						? {
								left: 14,
								right: 14,
								bottom: panelVisible
									? `calc(${mobilePanelHeight} + 74px + env(safe-area-inset-bottom))`
									: "calc(78px + env(safe-area-inset-bottom))",
								justifyContent: "center",
								gap: 6,
								padding: 6,
							}
						: {}),
				}}
				aria-label="Map filters"
			>
				{["all", "states", "coaches"].map((item) => (
					<button
						key={item}
						onClick={() => setFilter(item)}
						style={{
							...styles.controlButton,
							...(isMobile
								? { flex: 1, padding: "10px 8px", fontSize: 12 }
								: {}),
							...(filter === item ? styles.activeControl : {}),
						}}
					>
						{item[0].toUpperCase() + item.slice(1)}
					</button>
				))}
			</nav>

			<button
				type="button"
				style={{
					...styles.favoritesBar,
					...(isMobile
						? {
								left: "auto",
								right: 14,
								bottom: mobileActionBottom,
								width: "calc(50vw - 22px)",
								justifyContent: "center",
								padding: "13px 12px",
								fontSize: 13,
							}
						: {}),
				}}
				onClick={openFavoritesPanel}
				aria-label="Open favorite coaches"
			>
				<span>♡ Favorites</span>
				<span style={styles.favoritesCount}>{favoriteCoachIds.length}</span>
			</button>

			<div
				style={{
					position: "absolute",
					zIndex: 900,
					...(isMobile
						? {
								left: 14,
								right: 14,
								top: "calc(12px + env(safe-area-inset-top))",
							}
						: {
								right: isDesktop && panelVisible ? 458 : 24,
								top: 24,
							}),
					display: "flex",
					flexDirection: "column",
					alignItems: isMobile ? "stretch" : "flex-start",
					gap: 10,
					transition: "right 0.42s cubic-bezier(.66,.09,.28,1)",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "row" : "column",
						gap: 10,
						width: isMobile ? "100%" : "auto",
					}}
				>
					<button
						type="button"
						onClick={() => setLocationDropdownOpen((current) => !current)}
						style={{
							border: `1px solid ${selectedState ? "rgba(198,197,195,0.46)" : palette.border}`,
							background: selectedState
								? palette.graphite100
								: "rgba(30,28,30,0.82)",
							color: selectedState ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 14px 36px rgba(0,0,0,0.25)",
							fontWeight: 750,
							fontSize: 15,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
						aria-expanded={locationDropdownOpen ? "true" : "false"}
						aria-label="Choose coach location"
					>
						<span>
							📍{" "}
							{selectedState ? getStateByAbbr(selectedState)?.name : "Location"}
						</span>
					</button>

					<div
						style={{
							overflow: "hidden",
							...(isMobile
								? {
										position: "absolute",
										left: 0,
										right: 0,
										top: 58,
									}
								: {}),
							maxHeight: locationDropdownOpen ? (isMobile ? "42dvh" : 220) : 0,
							opacity: locationDropdownOpen ? 1 : 0,
							marginTop: locationDropdownOpen ? 0 : -4,
							transition:
								"max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease, margin-top 0.22s ease",
							pointerEvents: locationDropdownOpen ? "all" : "none",
						}}
					>
						<div
							style={{
								padding: 8,
								borderRadius: 22,
								background:
									"linear-gradient(145deg, rgba(30,28,30,0.97), rgba(55,53,55,0.94))",
								border: `1px solid ${palette.border}`,
								boxShadow: "0 24px 70px rgba(0,0,0,0.48)",
								backdropFilter: "blur(18px)",
								display: "flex",
								flexDirection: "column",
								gap: 4,
								maxHeight: isMobile ? "40dvh" : 204,
								overflowY: "auto",
								overflowX: "hidden",
								scrollbarWidth: "thin",
								scrollbarColor: "rgba(198,197,195,0.2) transparent",
							}}
						>
							{selectedState && (
								<button
									type="button"
									onClick={clearLocation}
									style={{
										border: 0,
										background: "transparent",
										color: palette.muted,
										borderRadius: 16,
										padding: "10px 12px",
										textAlign: "left",
										cursor: "pointer",
										fontWeight: 500,
										fontSize: 14,
										fontFamily: "inherit",
									}}
								>
									Clear location
								</button>
							)}
							{MOCK_STATES.map((stateItem) => {
								const active = selectedState === stateItem.abbr;
								return (
									<button
										key={stateItem.abbr}
										type="button"
										onClick={() => selectState(stateItem.abbr)}
										style={{
											border: `1px solid ${active ? "rgba(198,197,195,0.46)" : "transparent"}`,
											background: active
												? "rgba(198,197,195,0.12)"
												: "rgba(198,197,195,0.045)",
											color: palette.text,
											borderRadius: 16,
											padding: "11px 12px",
											textAlign: "left",
											cursor: "pointer",
											fontWeight: 500,
											fontSize: 14,
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 10,
											flexShrink: 0,
											fontFamily: "inherit",
										}}
									>
										<span>{stateItem.name}</span>
										<span
											style={{
												color: active ? palette.graphite100 : palette.muted,
												fontSize: 12,
												fontWeight: 500,
											}}
										>
											{stateItem.abbr}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<button
						type="button"
						onClick={openOnlinePanel}
						style={{
							border: `1px solid ${showOnline ? "rgba(198,197,195,0.46)" : palette.border}`,
							background: showOnline
								? palette.graphite100
								: "rgba(30,28,30,0.82)",
							color: showOnline ? palette.graphite900 : palette.text,
							borderRadius: 999,
							padding: "13px 17px",
							cursor: "pointer",
							backdropFilter: "blur(14px)",
							boxShadow: "0 14px 36px rgba(0,0,0,0.25)",
							fontWeight: 750,
							fontSize: 15,
							minWidth: 184,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 9,
						}}
						aria-pressed={showOnline ? "true" : "false"}
					>
						🌐 Online Training
					</button>
				</div>
			</div>

			<aside
				style={{
					...styles.glassPanel,
					width: isDesktop ? 430 : "100vw",
					height: isDesktop ? "100vh" : mobilePanelHeight,
					maxHeight: isDesktop ? "100vh" : "calc(100dvh - 84px)",
					top: isDesktop ? 0 : "auto",
					bottom: isDesktop ? "auto" : 0,
					right: 0,
					borderLeft: isDesktop ? `1px solid ${palette.border}` : "none",
					borderTop: isDesktop ? "none" : `1px solid ${palette.border}`,
					borderTopLeftRadius: isDesktop ? 0 : 24,
					borderTopRightRadius: isDesktop ? 0 : 24,
					padding: isDesktop
						? "34px 34px 22px"
						: "10px 16px calc(18px + env(safe-area-inset-bottom))",
					...(panelVisible
						? styles.glassPanelShown
						: {
								...styles.glassPanelHidden,
								transform: isDesktop ? "translateX(104%)" : "translateY(104%)",
							}),
				}}
				aria-hidden={!panelVisible}
			>
				{isMobile && panelVisible ? (
					<span style={styles.mobileSheetHandle} />
				) : null}
				{panelVisible ? (
					<CoachListPanel
						title={activePanelTitle}
						eyebrow={activePanelEyebrow}
						coaches={activePanelCoaches}
						onBack={resetToMap}
						profileCoach={profileCoach}
						setProfileCoach={setProfileCoach}
						search={search}
						setSearch={setSearch}
						hoveredCoachId={hoveredCoachId}
						setHoveredCoachId={setHoveredCoachId}
						favoriteCoachIds={favoriteCoachIds}
						onToggleFavorite={toggleFavoriteCoach}
						contactCoach={contactCoach}
						setContactCoach={setContactCoach}
						isDesktop={isDesktop}
						emptyMessage={activePanelEmptyMessage}
					/>
				) : null}
			</aside>
		</main>
	);
}
