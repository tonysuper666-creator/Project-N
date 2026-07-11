#include "PNWeaponComponent.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/Controller.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "DrawDebugHelpers.h"

UPNWeaponComponent::UPNWeaponComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UPNWeaponComponent::BeginPlay()
{
	Super::BeginPlay();
	Ammo = Data.MagSize;
	Reserve = Data.ReserveAmmo;
}

void UPNWeaponComponent::StartFire()
{
	bFiring = true;
	// Fire the first shot immediately if the cadence allows (semi & auto both).
	if (GetWorld() && GetWorld()->GetTimeSeconds() - LastFireTime >= Data.FireInterval)
	{
		Fire();
	}
}

void UPNWeaponComponent::StopFire()
{
	bFiring = false;
}

void UPNWeaponComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (bFiring && Data.bAutomatic && !bReloading && GetWorld())
	{
		if (Ammo > 0 && GetWorld()->GetTimeSeconds() - LastFireTime >= Data.FireInterval)
		{
			Fire();
		}
	}
}

void UPNWeaponComponent::Fire()
{
	UWorld* World = GetWorld();
	if (!World || bReloading) { return; }

	if (Ammo <= 0)
	{
		Reload();
		return;
	}

	AActor* OwnerActor = GetOwner();
	APawn* OwnerPawn = Cast<APawn>(OwnerActor);

	FVector ViewLoc = OwnerActor ? OwnerActor->GetActorLocation() : FVector::ZeroVector;
	FRotator ViewRot = OwnerActor ? OwnerActor->GetActorRotation() : FRotator::ZeroRotator;
	if (OwnerPawn && OwnerPawn->GetController())
	{
		OwnerPawn->GetController()->GetPlayerViewPoint(ViewLoc, ViewRot);
	}

	const FVector Start = ViewLoc;
	const FVector End = Start + ViewRot.Vector() * Data.RangeCm;

	FHitResult Hit;
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(OwnerActor);
	Params.bTraceComplex = true;

	if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		if (AActor* HitActor = Hit.GetActor())
		{
			UGameplayStatics::ApplyPointDamage(
				HitActor, Data.Damage, ViewRot.Vector(), Hit,
				OwnerPawn ? OwnerPawn->GetController() : nullptr, OwnerActor, nullptr);
		}
		DrawDebugLine(World, Start, Hit.ImpactPoint, FColor::Yellow, false, 0.05f, 0, 1.f);
	}
	else
	{
		DrawDebugLine(World, Start, End, FColor::Yellow, false, 0.05f, 0, 1.f);
	}

	--Ammo;
	LastFireTime = World->GetTimeSeconds();
}

void UPNWeaponComponent::Reload()
{
	if (bReloading || Ammo == Data.MagSize || Reserve <= 0) { return; }
	bReloading = true;
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().SetTimer(ReloadTimerHandle, this, &UPNWeaponComponent::FinishReload, Data.ReloadTime, false);
	}
}

void UPNWeaponComponent::FinishReload()
{
	const int32 Need = Data.MagSize - Ammo;
	const int32 Take = FMath::Min(Need, Reserve);
	Ammo += Take;
	Reserve -= Take;
	bReloading = false;
}
