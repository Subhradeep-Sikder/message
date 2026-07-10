export async function checkAuth(req, res, next) { 
    if(!req.user){
        res.status(401).json({error: "Unauthorized"});
        return;
    }
    res.status(200).json({ok:true, user:req.user});
}