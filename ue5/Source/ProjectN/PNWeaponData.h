#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "PNWeaponData.generated.h"

/**
 * Data-driven weapon definition — the UE5 equivalent of a DEFS/PRIMARY_DEFS
 * entry in the web game's weapons.js. Put one row per weapon in a DataTable
 * (Content Browser -> Miscellaneous -> Data Table -> pick FPNWeaponData) so
 * designers tune weapons without recompiling — mirrors the "data-driven, never
 * hardcoded" rule from the original project's coding standards.
 */
USTRUCT(BlueprintType)
struct FPNWeaponData : public FTableRowBase
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	FString DisplayName = TEXT("Rifle");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	float Damage = 14.f;

	// Seconds between shots (fireRate in the web game).
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	float FireInterval = 0.1f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	int32 MagSize = 30;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	int32 ReserveAmmo = 150;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	float ReloadTime = 1.4f;

	// Trace distance in centimetres (UE unit). 12000 = 120 m, ~ web "range 120".
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	float RangeCm = 12000.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	bool bAutomatic = true;
};
