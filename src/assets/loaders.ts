import { TILE_TYPES, TileType } from "../board";

import clayUrl from "../../assets/clay.png";
import desertUrl from "../../assets/desert.png";
import forestUrl from "../../assets/forest.png";
import mountainUrl from "../../assets/mountain.png";
import sheepUrl from "../../assets/sheep.png";
import wheatUrl from "../../assets/wheat.png";

import iconBrickUrl from "../../assets/resources/brick.png";
import iconWoodUrl from "../../assets/resources/wood.png";
import iconStoneUrl from "../../assets/resources/stone.png";
import iconSheepUrl from "../../assets/resources/sheep.png";
import iconWheatUrl from "../../assets/resources/wheat.png";
import settlementUrl from "../../assets/buildings/settlement.png";
import settlementCmaskUrl from "../../assets/buildings/settlement_cmask.png";
import cityUrl from "../../assets/buildings/city.png";
import cityCmaskUrl from "../../assets/buildings/city_cmask.png";
import bridge30upUrl from "../../assets/buildings/bridge30up.png";
import bridge30upCmaskUrl from "../../assets/buildings/bridge30up_cmask.png";
import bridge30downUrl from "../../assets/buildings/bridge30down.png";
import bridge30downCmaskUrl from "../../assets/buildings/bridge30down_cmask.png";
import bridgeVerticalUrl from "../../assets/buildings/bridgevertical.png";
import bridgeVerticalCmaskUrl from "../../assets/buildings/bridgevertical_cmask.png";
import thievesUrl from "../../assets/thieves.png";

export { iconBrickUrl, iconWoodUrl, iconStoneUrl, iconSheepUrl, iconWheatUrl };

export const TILE_URLS: Record<TileType, string> = {
  bricks: clayUrl,
  desert: desertUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sheep: sheepUrl,
  wheat: wheatUrl,
};

// Port resource → icon image url (subset of TileType, no desert).
export const PORT_ICON_URLS: Partial<Record<TileType, string>> = {
  bricks: iconBrickUrl,
  forest: iconWoodUrl,
  mountain: iconStoneUrl,
  sheep: iconSheepUrl,
  wheat: iconWheatUrl,
};

export async function loadImages(): Promise<Record<TileType, HTMLImageElement>> {
  const entries = await Promise.all(
    TILE_TYPES.map(
      (t) =>
        new Promise<[TileType, HTMLImageElement]>((res, rej) => {
          const img = new Image();
          img.onload = () => res([t, img]);
          img.onerror = rej;
          img.src = TILE_URLS[t];
        })
    )
  );
  return Object.fromEntries(entries) as Record<TileType, HTMLImageElement>;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

export async function loadPortIcons(): Promise<Partial<Record<TileType, HTMLImageElement>>> {
  const entries = await Promise.all(
    Object.entries(PORT_ICON_URLS).map(
      ([t, url]) =>
        new Promise<[TileType, HTMLImageElement]>((res, rej) => {
          const img = new Image();
          img.onload = () => res([t as TileType, img]);
          img.onerror = rej;
          img.src = url!;
        })
    )
  );
  return Object.fromEntries(entries);
}

export type BuildingImgs = {
  settlement: HTMLImageElement;
  settlementMask: HTMLImageElement;
  city: HTMLImageElement;
  cityMask: HTMLImageElement;
  bridge30up: HTMLImageElement;
  bridge30upMask: HTMLImageElement;
  bridge30down: HTMLImageElement;
  bridge30downMask: HTMLImageElement;
  // Straight (vertical-edge) bridge artwork pending — null means skip render.
  bridgeStraight: HTMLImageElement | null;
  bridgeStraightMask: HTMLImageElement | null;
  // Thieves / robber — neutral piece (no per-player tint). Sits on the
  // desert by default and is moved when a 7 is rolled.
  thieves: HTMLImageElement;
};

export async function loadBuildingImgs(): Promise<BuildingImgs> {
  return {
    settlement: await loadImage(settlementUrl),
    settlementMask: await loadImage(settlementCmaskUrl),
    city: await loadImage(cityUrl),
    cityMask: await loadImage(cityCmaskUrl),
    bridge30up: await loadImage(bridge30upUrl),
    bridge30upMask: await loadImage(bridge30upCmaskUrl),
    bridge30down: await loadImage(bridge30downUrl),
    bridge30downMask: await loadImage(bridge30downCmaskUrl),
    bridgeStraight: await loadImage(bridgeVerticalUrl),
    bridgeStraightMask: await loadImage(bridgeVerticalCmaskUrl),
    thieves: await loadImage(thievesUrl),
  };
}
