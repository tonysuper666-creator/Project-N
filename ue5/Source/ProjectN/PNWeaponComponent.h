#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "PNWeaponData.h"
#include "PNWeaponComponent.generated.h"

/**
 * Hitscan weapon logic as a component you attach to a Pawn. Port of the fire /
 * reload / ammo logic in weapons.js. Fires a LineTrace from the owning
 * controller's view point (the UE equivalent of the web game's camera raycast)
 * and applies point damage to whatever it hits.
 */
UCLASS(ClassGroup = (ProjectN), meta = (BlueprintSpawnableComponent))
class PROJECTN_API UPNWeaponComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UPNWeaponComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Weapon")
	FPNWeaponData Data;

	UPROPERTY(BlueprintReadOnly, Category = "Weapon")
	int32 Ammo = 30;

	UPROPERTY(BlueprintReadOnly, Category = "Weapon")
	int32 Reserve = 150;

	UFUNCTION(BlueprintCallable, Category = "Weapon")
	void StartFire();

	UFUNCTION(BlueprintCallable, Category = "Weapon")
	void StopFire();

	UFUNCTION(BlueprintCallable, Category = "Weapon")
	void Reload();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

protected:
	virtual void BeginPlay() override;

	void Fire();
	void FinishReload();

	bool bFiring = false;
	bool bReloading = false;
	float LastFireTime = -1000.f;
	FTimerHandle ReloadTimerHandle;
};
