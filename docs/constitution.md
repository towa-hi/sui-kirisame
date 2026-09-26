This is the Kirisame constitution. The purpose is to serve as a consistent direction and point of reference to consult when making design decisions. This document is meant to be read by humans and robots.

Glossary

Kirisame
    Kirisame is both the dapp, the smart contract on Sui and governance system explained here. Kirisame will eventually become a more generalized framework, so the module Kirisame::umbrella is designed with just umbrellas in mind.

Quarantine
    QUARANTINE is a state an umbrella enters when a HELD umbrella is inserted into a quarantine box at a station where funds associated with the umbrella are frozen until further inspection

Ownership
    Umbrella objects in Sui are technically owned by nobody, and their state and balance can only be mutated by calling the contract functions with the correct cap. Once a Umbrella object becomes RETIRED or SOLD, the balances are distributed and it is freed from the system and can no longer be mutated. Actual ownership of the physical object belongs to the purchaser from the moment of purchase until it is docked.


Actors

The Kirisame system depends on actors to perform their responsibilites to keep things running. What I am detailing here is essentially a business plan, but for this demo I don't want to get too deep into the specifics because I am not a lawyer. That's why the actors are given non-business related names.

Admin (short for Administration)

    Responsibility:
        Oversee the good behavior of stations. This is really important because a rogue actor with a station cap can cause a lot of harm to the network with false dock actions, even if there's no way to profit from this.
    Methods:
        Admin can revoke and transfer station caps.
    Incentive:
        Continued health and usability of the network.
    
    Resonsibility:
        Ensure settlement of frozen escrow balances on a reasonable interval. While this isn't strictly nessessary, it prevents users from never getting their refunds if their umbrella is never used again after returning.
    Methods:
        Admin have access to atomic sweep functions that resolve the state of umbrellas based on their attested condition. Admin is the final authority for assessing the condition of quarantined umbrellas and preventing unfairly quarantined umbrellas from freezing users funds.
    Incentive:
        Frozen funds don't benefit anyone, and settling disputes fairly (such as differentiating between normal wear and tear and intentional damge) is something that cannot be automated even in a trustless system.

    Resonsibility:
        Physical assessment and disposal of quarantined umbrellas.
    Methods:
        Admins would have to bear the operational expense and final responsibility for the disposal of quarantined objects.
    Incentive:
        Funds tied to quarantined objects are frozen until reviewed, so it is benificial to free them.

Station (Station master)

    Responsibility:
        Maintain a usable physical terminal that people can use. There is no spec for how terminals would work physically, but there are many examples of umbrella sharing terminals. Some have absolutely no security whatsoever while others are shaped like lockers. As long as the locker contains a one-way quarantine bin. 
    Methods:
        Station masters own the land the station sits on. They are basically landlords and businesses.
    Incentive:
        Actual laws and contracts would need to exist to keep Admin and Stations aligned. Admins have complete control over Stations network privileges. Station masters can only make money from the continued use of their stations.

Supplier

    Responsibility:
        The supplier is responsible for supplying actual umbrellas into the system and dock them. 
    Methods:
        As of now, umbrellas are bound by QR codes that are provided by the dapp after object creation. 
    Incentive:
        Suppliers must pay a bond greater than the value of a typical umbrella in order to add their umbrella into the system. This bond goes directly to the admin and covers the cost of disposal and disincentivizes submitting garbage. Bad umbrellas will simply not make their bond back if they are constantly quarantined.
    
    Responsibility:
        This is not actually a 'responsibility', but Suppliers are highly incentivized to restock high demand stations and move stock out of low demand stations.
    Methods:
        In the future it is planned for suppliers to be able to move umbrellas associated with them to new stations at a reduced cost
    Incentive:
        Umbrellas that do not get used do not make money.

User

    Responsibility:
        Users are given a window five minutes after purchase to inspect their umbrella. Users are the first line of defense for assessing the condition of umbrellas in the system.
    Methods:
        Unsatisfactory umbrellas are put into a one way quarantine bin to be confirmed by admins in the future.
    Incentive:
        Users should promptly quarantine damaged umbrellas so they do not potentially lose their refund if the next user notices the damage (fault has to be confirmed by both the next user and Admin)


